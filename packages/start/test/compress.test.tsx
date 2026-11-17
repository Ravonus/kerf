// HTML and data are compressed for a client that takes it, with no setting.
import type * as Zlib from 'node:zlib'
import { brotliDecompressSync, gunzipSync, createBrotliDecompress } from 'node:zlib'
import { vi } from 'vitest'
import { Boundary, resource } from '@kerf-js/core'
import { createHandler, type Manifest } from '../src/server'

const zlib = vi.hoisted(() => ({ brotliCompress: 0, gzip: 0 }))
vi.mock('node:zlib', async (real) => {
  const z = await real<typeof Zlib>()
  const counted =
    (name: 'brotliCompress' | 'gzip') =>
    (...args: unknown[]) => (zlib[name]++, (z[name] as (...a: unknown[]) => void)(...args))
  return { ...z, brotliCompress: counted('brotliCompress'), gzip: counted('gzip') }
})

let release = () => {}
let seen = 0
const Slow = () => {
  const r = resource(
    () =>
      new Promise<string>((ok) => {
        release = () => ok('late')
      }),
  )
  return <p>{r.value}</p>
}
const page = (id: string, file: string) => ({
  id,
  file,
  layouts: [],
  pattern: id,
  params: [],
  kind: 'page' as const,
})
const manifest: Manifest = {
  dir: 'src/routes',
  layouts: [],
  routes: [
    page('/', 'home'),
    page('/other', 'other'),
    page('/count', 'count'),
    page('/slow', 'slow'),
  ],
}
const handler = createHandler({
  manifest,
  modules: {
    home: { default: () => <h1>Lemon</h1> },
    other: { default: () => <h1>Lime</h1> },
    count: { default: () => <h1>Visit {++seen}</h1> },
    slow: {
      default: () => (
        <main>
          <h1>Shell</h1>
          <Boundary pending={<i>wait</i>}>
            <Slow />
          </Boundary>
        </main>
      ),
    },
  },
})
const get = (headers: Record<string, string> = {}, path = '/') =>
  handler(new Request(`http://localhost${path}`, { headers }))
const unbr = async (res: Response) =>
  brotliDecompressSync(Buffer.from(await res.arrayBuffer())).toString()

test('a page is gzipped for a client that takes it, and says so', async () => {
  const res = await get({ 'accept-encoding': 'gzip' })
  expect(res.headers.get('content-encoding')).toBe('gzip')
  expect(res.headers.get('vary')).toContain('Accept-Encoding')
  expect(gunzipSync(Buffer.from(await res.arrayBuffer())).toString()).toContain('Lemon')
})

test('brotli wins when the client takes both', async () => {
  const res = await get({ 'accept-encoding': 'gzip, br' })
  expect(res.headers.get('content-encoding')).toBe('br')
  expect(brotliDecompressSync(Buffer.from(await res.arrayBuffer())).toString()).toContain('Lemon')
})

test('a client that takes neither gets the plain page', async () => {
  const res = await get()
  expect(res.headers.get('content-encoding')).toBeNull()
  expect(await res.text()).toContain('Lemon')
})

test('an identical page is compressed once', async () => {
  const before = zlib.brotliCompress
  const [a, b] = await Promise.all([
    get({ 'accept-encoding': 'br' }, '/other'),
    get({ 'accept-encoding': 'br' }, '/other'),
  ])
  const c = await get({ 'accept-encoding': 'br' }, '/other')
  expect(zlib.brotliCompress - before).toBe(1)
  expect(await unbr(a)).toContain('Lime')
  expect(await unbr(b)).toContain('Lime')
  expect(await unbr(c)).toContain('Lime')
})

test('each encoding is kept apart', async () => {
  await get({ 'accept-encoding': 'br' }, '/other')
  const res = await get({ 'accept-encoding': 'gzip' }, '/other')
  expect(res.headers.get('content-encoding')).toBe('gzip')
  expect(gunzipSync(Buffer.from(await res.arrayBuffer())).toString()).toContain('Lime')
})

test('a page that differs is never served from another one', async () => {
  const a = await unbr(await get({ 'accept-encoding': 'br' }, '/count'))
  const b = await unbr(await get({ 'accept-encoding': 'br' }, '/count'))
  expect(a).toMatch(/Visit (<!--.*?-->)?1\b/)
  expect(b).toMatch(/Visit (<!--.*?-->)?2\b/)
})

test('a Boundary still flushes: the shell decompresses before it resolves, its content after', async () => {
  const res = await get({ 'accept-encoding': 'br' }, '/slow')
  expect(res.headers.get('content-encoding')).toBe('br')
  const un = createBrotliDecompress()
  let text = ''
  un.on('data', (d) => (text += d))
  const seenText = (s: string) => vi.waitFor(() => expect(text).toContain(s), { timeout: 5000 })
  const reader = res.body!.getReader()
  const pump = (async () => {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) return void un.end()
      un.write(value)
    }
  })()
  await seenText('Shell')
  expect(text).toContain('wait')
  expect(text).not.toContain('late')
  release()
  await seenText('late')
  await pump
  await seenText('</html>')
})

test('data is compressed once too', async () => {
  const before = zlib.gzip
  const [a, b] = await Promise.all(
    ['a', 'b'].map(() =>
      handler(
        new Request('http://localhost/_kerf/data/', { headers: { 'accept-encoding': 'gzip' } }),
      ),
    ),
  )
  expect(zlib.gzip - before).toBe(1)
  expect(a!.headers.get('content-type')).toContain('application/json')
  expect(JSON.parse(gunzipSync(Buffer.from(await a!.arrayBuffer())).toString()).p).toBe('/')
  expect(b!.status).toBe(200)
})

test('a response hook receives plain HTML before the final gzip encoding', async () => {
  let receivedEncoding: string | null | undefined
  const hooked = createHandler({
    manifest,
    modules: { home: { default: () => <h1>Hooked lemon</h1> } },
    handle: async (request, next) => {
      const response = await next(request)
      receivedEncoding = response.headers.get('content-encoding')
      const text = await response.text()
      return new Response(
        text.replace('</head>', '<meta name="hooked" content="yes"></head>'),
        response,
      )
    },
  })
  const response = await hooked(
    new Request('http://localhost/', { headers: { 'accept-encoding': 'gzip' } }),
  )
  expect(receivedEncoding).toBeNull()
  expect(response.headers.get('content-encoding')).toBe('gzip')
  const text = gunzipSync(Buffer.from(await response.arrayBuffer())).toString()
  expect(text).toContain('<meta name="hooked" content="yes">')
  expect(text).toContain('Hooked lemon')
})

test('a streaming HTML hook preserves late boundaries under brotli encoding', async () => {
  const hooked = createHandler({
    manifest,
    modules: {
      slow: {
        default: () => (
          <main>
            <h1>Hook shell</h1>
            <Boundary pending={<i>hook wait</i>}>
              <Slow />
            </Boundary>
          </main>
        ),
      },
    },
    handle: async (request, next) => {
      const response = await next(request)
      expect(response.headers.get('content-encoding')).toBeNull()
      const marker = new TextEncoder().encode('<!--hook-stream-->')
      return new Response(
        response.body!.pipeThrough(
          new TransformStream<Uint8Array, Uint8Array>({
            start(controller) {
              controller.enqueue(marker)
            },
            transform(chunk, controller) {
              controller.enqueue(chunk)
            },
          }),
        ),
        response,
      )
    },
  })
  const response = await hooked(
    new Request('http://localhost/slow', { headers: { 'accept-encoding': 'br' } }),
  )
  const un = createBrotliDecompress()
  let text = ''
  un.on('data', (chunk) => (text += chunk))
  const reader = response.body!.getReader()
  const pump = (async () => {
    for (;;) {
      const { value, done } = await reader.read()
      if (done) return void un.end()
      un.write(value)
    }
  })()
  await vi.waitFor(() => expect(text).toContain('Hook shell'))
  expect(text).toContain('<!--hook-stream-->')
  expect(text).toContain('hook wait')
  expect(text).not.toContain('late')
  release()
  await pump
  await vi.waitFor(() => expect(text).toContain('late'))
})
