// HTML and data are compressed for a client that takes it, with no setting.
import { brotliDecompressSync, gunzipSync, createBrotliDecompress } from 'node:zlib'
import { vi } from 'vitest'
import { Boundary, resource } from 'weft'
import { createHandler, type Manifest } from '../src/server'

const zlib = vi.hoisted(() => ({ brotliCompress: 0, gzip: 0 }))
vi.mock('node:zlib', async real => {
  const z = await real<typeof import('node:zlib')>()
  const counted = (name: 'brotliCompress' | 'gzip') => (...args: any[]) => (zlib[name]++, (z[name] as any)(...args))
  return { ...z, brotliCompress: counted('brotliCompress'), gzip: counted('gzip') }
})

let release = () => {}
let seen = 0
const Slow = () => {
  const r = resource(() => new Promise<string>(ok => (release = () => ok('late'))))
  return <p>{r.value}</p>
}
const page = (id: string, file: string) => ({ id, file, layouts: [], pattern: id, params: [], kind: 'page' as const })
const manifest: Manifest = { dir: 'src/routes', layouts: [], routes: [page('/', 'home'), page('/other', 'other'), page('/count', 'count'), page('/slow', 'slow')] }
const handler = createHandler({
  manifest,
  modules: {
    home: { default: () => <h1>Lemon</h1> },
    other: { default: () => <h1>Lime</h1> },
    count: { default: () => <h1>Visit {++seen}</h1> },
    slow: { default: () => <main><h1>Shell</h1><Boundary pending={<i>wait</i>}><Slow /></Boundary></main> },
  } as any,
})
const get = (headers: Record<string, string> = {}, path = '/') => handler(new Request(`http://localhost${path}`, { headers }))
const unbr = async (res: Response) => brotliDecompressSync(Buffer.from(await res.arrayBuffer())).toString()

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
  const [a, b] = await Promise.all([get({ 'accept-encoding': 'br' }, '/other'), get({ 'accept-encoding': 'br' }, '/other')])
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
  un.on('data', d => (text += d))
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
  const [a, b] = await Promise.all(['a', 'b'].map(() => handler(new Request('http://localhost/_weft/data/', { headers: { 'accept-encoding': 'gzip' } }))))
  expect(zlib.gzip - before).toBe(1)
  expect(a.headers.get('content-type')).toContain('application/json')
  expect(JSON.parse(gunzipSync(Buffer.from(await a.arrayBuffer())).toString()).p).toBe('/')
  expect(b.status).toBe(200)
})
