// Where a page's absolute URLs come from when `site.url` is not set (research 20 §10).
import type { Loose } from './loose'
import { createHandler } from '../src/server'

const manifest = { root: '', dir: 'src/routes', routes: [], layouts: [], problems: [] } as Loose
const canonical = (text: string) => /<link rel="canonical" href="([^"]*)"/.exec(text)?.[1]

function handler(found: Loose[] = [], extra = {}) {
  return createHandler({ manifest, modules: {}, site: { name: 'Acme' }, onDiagnostic: d => found.push(d), ...extra })
}

afterEach(() => { delete process.env.WEFT_SITE_URL })

test('production, nothing configured: the request`s origin, and H001 once', async () => {
  const found: Loose[] = []
  const app = handler(found)
  const r = await app(new Request('https://evil.example/x'))
  await app(new Request('https://evil.example/y'))
  expect(canonical(await r.text())).toBe('https://evil.example/x')
  expect(found.filter(d => d.code === 'H001')).toMatchObject([{ severity: 'warning' }])
})

test('dev: the same origin, and nothing to warn about', async () => {
  const found: Loose[] = []
  await handler(found, { dev: true })(new Request('http://localhost:5173/'))
  expect(found.filter(d => d.code === 'H001')).toEqual([])
})

test('the deploy environment wins over any Host a request claims', async () => {
  process.env.WEFT_SITE_URL = 'https://acme.dev'
  const found: Loose[] = []
  const r = await handler(found)(new Request('https://evil.example/x'))
  expect(canonical(await r.text())).toBe('https://acme.dev/x')
  expect(found.filter(d => d.code === 'H001')).toEqual([])
})

test('a prerender never writes its own address into a page', async () => {
  const r = await handler()(new Request('http://localhost/x', { headers: { 'x-nitro-prerender': '/x' } }))
  expect(canonical(await r.text())).toBeUndefined()
})
