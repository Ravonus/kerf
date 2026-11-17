import { serverLog, createHandler, type HandlerOptions, type Manifest } from '../src/server'
import { page } from './stream.fixture'

const secret = 'private database exception'
const fault = () => new Error(secret)
const get = (path: string, headers?: HeadersInit) =>
  new Request('http://localhost' + path, headers ? { headers } : undefined)

function setup(modules: HandlerOptions['modules'], dev = false) {
  const manifest: Manifest = {
    dir: 'src/routes',
    layouts: [{ id: 'layout:', file: 'layout', dir: '' }],
    routes: [
      { ...page('/broken', 'broken'), layouts: ['layout:'] },
      { ...page('error', 'error'), kind: 'error' },
    ],
  }
  return createHandler({
    manifest,
    modules: {
      layout: { default: (props: { children: unknown }) => <header>{props.children}</header> },
      ...modules,
    },
    site: { trustProxy: true, log: 'json' },
    onDiagnostic: serverLog({ log: 'json' }),
    dev,
  })
}

test('a production loader failure has one opaque reference in its page, header and log', async () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  try {
    const handler = setup({
      broken: {
        load: () => {
          throw fault()
        },
      },
    })
    const first = await handler(get('/broken', { 'x-request-id': 'from-proxy' }))
    const ref = first.headers.get('x-kerf-error')
    expect(ref).toMatch(/^[a-f0-9]{24}$/)
    expect(first.headers.get('x-request-id')).toBe('from-proxy')
    expect(first.status).toBe(500)
    expect(first.headers.get('cache-control')).toBe('no-store')
    const html = await first.text()
    expect(html).toContain(ref)
    expect(html).toContain('<header')
    expect(html).not.toContain(secret)
    expect(html).not.toContain('"stack"')
    const logged = warn.mock.calls.map(([line]) => JSON.parse(String(line)))
    expect(logged).toContainEqual(
      expect.objectContaining({
        reference: ref,
        requestId: 'from-proxy',
        message: expect.stringContaining(secret),
      }),
    )
    const next = await handler(get('/_kerf/data/broken', { 'x-request-id': 'from-proxy' }))
    const payload = await next.json()
    expect(payload.m.at(-1).data.reference).toBe(next.headers.get('x-kerf-error'))
    expect(next.headers.get('x-kerf-error')).not.toBe(ref)
    expect(JSON.stringify(payload)).not.toContain(secret)
  } finally {
    warn.mockRestore()
  }
})

test('a root failure discards the failed layout, and development includes the original stack', async () => {
  const handler = setup(
    {
      layout: {
        default: () => {
          throw fault()
        },
      },
      broken: {},
    },
    true,
  )
  const response = await handler(get('/broken'))
  const html = await response.text()
  expect(response.status).toBe(500)
  expect(html).not.toContain('<header')
  expect(html).toContain(secret)
  expect(html).toContain('"stack":"Error: private database exception')
  expect(html).toContain('Reload page')
})

test('a broken app error view falls back to the built-in view under its healthy layout', async () => {
  const handler = setup({
    broken: {
      load: () => {
        throw fault()
      },
    },
    error: {
      default: () => {
        throw new Error('broken custom error view')
      },
    },
  })
  const response = await handler(get('/broken'))
  const html = await response.text()
  expect(response.status).toBe(500)
  expect(html).toContain('<header')
  expect(html).toContain('Reload page')
  expect(html).not.toContain('broken custom error view')
})
