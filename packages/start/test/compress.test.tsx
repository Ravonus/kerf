// HTML and data are compressed for a client that takes it, with no setting.
import { brotliDecompressSync, gunzipSync } from 'node:zlib'
import { createHandler, type Manifest } from '../src/server'

const manifest: Manifest = { dir: 'src/routes', layouts: [], routes: [{ id: '/', file: 'home', layouts: [], pattern: '/', params: [], kind: 'page' }] }
const handler = createHandler({ manifest, modules: { home: { default: () => <h1>Lemon</h1> } } as any })
const get = (headers: Record<string, string> = {}) => handler(new Request('http://localhost/', { headers }))

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
