import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { scanRoutes } from '../src/routes.mjs'
import { makeHttp } from '../src/server/http'
import { createScope } from '../src/exec'
import { createState } from '../src/vite/state.mjs'
import { configHook } from '../src/vite/config-hooks.mjs'
import { createHandler } from '../src/server'
import type { HandlerOptions } from '../src/server'

const scratch: string[] = []
afterEach(() => scratch.splice(0).forEach((p) => rmSync(p, { recursive: true, force: true })))

function scan(files: Record<string, string>) {
  const root = mkdtempSync(join(tmpdir(), 'kerf-http-'))
  scratch.push(root)
  for (const [file, text] of Object.entries(files)) {
    const path = join(root, 'src/routes', file)
    mkdirSync(join(path, '..'), { recursive: true })
    writeFileSync(path, text)
  }
  return scanRoutes(root)
}

test('HTTP discovery handles dotted directories, named re-exports and catch-alls without page entries', () => {
  const m = scan({
    '.well-known/agent.http.ts': 'export function GET() {}',
    'api/[id].http.ts': 'export { post as POST } from "../../server/handler"',
    'r/[...path].http.ts': 'export const GET = () => {}',
    'files/[[...path]].http.ts': 'export function GET() {}',
  })
  expect(m.problems).toEqual([])
  expect(m.routes).toEqual([])
  expect(m.http.map((r) => [r.pattern, r.methods])).toEqual([
    ['/.well-known/agent', ['GET']],
    ['/api/$id', ['POST']],
    ['/files/$$', ['GET']],
    ['/r/$', ['GET']],
  ])
})

test('H018 rejects a page/HTTP GET or HEAD collision, including renamed params; POST can coexist', () => {
  expect(
    scan({ '[id].tsx': 'export default () => null', '[name].http.ts': 'export function GET() {}' })
      .problems,
  ).toMatchObject([{ code: 'H018' }])
  expect(
    scan({ 'index.tsx': 'export default () => null', 'index.http.ts': 'export function HEAD() {}' })
      .problems,
  ).toMatchObject([{ code: 'H018' }])
  expect(
    scan({ 'index.tsx': 'export default () => null', 'index.http.ts': 'export function POST() {}' })
      .problems,
  ).toEqual([])
})

test('H019 rejects malformed catch-alls and modules without named methods', () => {
  expect(
    scan({
      '[...path]/extra.http.ts': 'export function GET() {}',
      'empty.http.ts': 'export default () => {}',
    }).problems.map((p) => p.code),
  ).toEqual(['H019', 'H019'])
})

const options = (o: Partial<HandlerOptions> = {}): HandlerOptions => ({
  manifest: {
    dir: 'src/routes',
    routes: [],
    layouts: [],
    http: [
      {
        file: 'api.http.ts',
        path: '/api/[id]',
        pattern: '/api/$id',
        params: ['id'],
        methods: ['POST'],
      },
    ],
  },
  modules: {},
  ...o,
})

test('raw POST keeps its JSON body, bypasses Q010 and only creates ctx on demand', async () => {
  let contexts = 0
  const handler = createHandler(
    options({
      context: () => {
        contexts++
        return { ready: true }
      },
      httpModules: {
        'api.http.ts': {
          POST: async (request, { params, ctx }) => {
            expect(request.bodyUsed).toBe(false)
            if (params.id === 'ctx') {
              expect(await ctx()).toBe(await ctx())
            }
            return Response.json({ params, input: await request.json() })
          },
        },
      },
    }),
  )
  const res = await handler(
    new Request('http://local/api/a%20b', {
      method: 'POST',
      headers: { origin: 'https://other.test' },
      body: '{"x":1}',
    }),
  )
  expect(await res.json()).toEqual({ params: { id: 'a b' }, input: { x: 1 } })
  expect(contexts).toBe(0)
  await (await handler(new Request('http://local/api/ctx', { method: 'POST', body: '{}' }))).text()
  expect(contexts).toBe(1)
  const refused = await handler(new Request('http://local/api/a'))
  expect(refused.status).toBe(405)
  expect(refused.headers.get('allow')).toBe('POST')
})

test('a request hook short-circuits every framework request and wraps next with a replacement request', async () => {
  const seen: string[] = []
  const handler = createHandler(
    options({
      httpModules: {
        'api.http.ts': {
          POST: (req) => {
            seen.push(req.headers.get('x-hook')!)
            return new Response('routed')
          },
        },
      },
      handle: async (request, next) => {
        if (new URL(request.url).pathname === '/_kerf/health')
          return new Response('setup', { status: 307, headers: { location: '/setup' } })
        const replacement = new Request(request, { headers: { 'x-hook': 'yes' } })
        const response = await next(replacement)
        response.headers.set('server-timing', 'app;dur=1')
        return response
      },
    }),
  )
  expect((await handler(new Request('http://local/_kerf/health'))).headers.get('location')).toBe(
    '/setup',
  )
  const response = await handler(
    new Request('http://local/api/id', { method: 'POST', body: 'raw' }),
  )
  expect(await response.text()).toBe('routed')
  expect(response.headers.get('server-timing')).toBe('app;dur=1')
  expect(seen).toEqual(['yes'])
})

test('raw Range, encoded bytes and security/cache headers survive Accept-Encoding', async () => {
  const handler = createHandler(
    options({
      httpModules: {
        'api.http.ts': {
          POST: () =>
            new Response('bytes', {
              status: 206,
              headers: {
                'content-type': 'application/json',
                'content-range': 'bytes 2-6/9',
                'content-encoding': 'custom',
                'cache-control': 'private, no-transform',
                'x-frame-options': 'DENY',
              },
            }),
        },
      },
    }),
  )
  const response = await handler(
    new Request('http://local/api/id', {
      method: 'POST',
      headers: { 'accept-encoding': 'gzip, br' },
    }),
  )
  expect(response.status).toBe(206)
  expect(Object.fromEntries(response.headers)).toMatchObject({
    'content-range': 'bytes 2-6/9',
    'content-encoding': 'custom',
    'cache-control': 'private, no-transform',
    'x-frame-options': 'DENY',
  })
  expect(await response.text()).toBe('bytes')
})

test('a hook header wrapper preserves WebSocket transport hooks, while a replacement refusal cannot upgrade', async () => {
  for (const refuse of [false, true]) {
    const handler = createHandler(
      options({
        handle: async (request, next) => {
          const response = await next(request)
          return new Response(response.body, {
            status: refuse ? 403 : response.status,
            headers: response.headers,
          })
        },
      }),
    )
    const response = await handler(
      new Request('http://local/_kerf/ws', {
        headers: { origin: 'http://local', upgrade: 'websocket' },
      }),
    )
    expect(response.status).toBe(refuse ? 403 : 426)
    expect(Reflect.has(response, 'crossws')).toBe(!refuse)
    await response.text()
  }
})

test('dev and build fail on H018 before app modules execute', () => {
  const manifest = scan({
    'index.tsx': 'export default () => null',
    'index.http.ts': 'export function GET() {}',
  })
  for (const command of ['serve', 'build'])
    expect(() => configHook(createState({ root: manifest.root }))({}, { command })).toThrow('H018')
})

test('a static page outranks a param HTTP route, and shared paths advertise all available methods', async () => {
  const manifest = scan({
    'fixed.tsx': 'export default () => null',
    '[id].http.ts': 'export function GET() {}',
    'fixed.http.ts': 'export function POST() {}',
  })
  const route = makeHttp({
    manifest,
    modules: {},
    httpModules: {
      'src/routes/[id].http.ts': { GET: () => new Response('dynamic') },
      'src/routes/fixed.http.ts': { POST: () => new Response('post') },
    },
  })
  const req = (path: string, method = 'GET') => new Request('http://local' + path, { method })
  const request = req('/fixed')
  expect(await route(request, createScope(request))).toBeUndefined()
  const dynamic = req('/other')
  expect(await (await route(dynamic, createScope(dynamic)))!.text()).toBe('dynamic')
  const unsupported = req('/fixed', 'DELETE')
  const response = await route(unsupported, createScope(unsupported))
  expect(response?.status).toBe(405)
  expect(response?.headers.get('allow')).toBe('POST, GET, HEAD')
})
