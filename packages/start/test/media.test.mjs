// The media route over HTTP on the fixture (research 29 §6): an upload through `<Form>`'s no-JS path, `ctx.media.ingest`,
// the record `z.media()` validates, `Accept` negotiation, the cache headers, what the route refuses, and M018/M012.
import { createRequire } from 'node:module'
import { inject } from 'vitest'
import { fnId } from '../src/vite.mjs'

const url = inject('url')
const sharp = createRequire(new URL('../../plugin-media/package.json', import.meta.url))('sharp')
const png = (color = { r: 200, g: 60, b: 20 }) => sharp({ create: { width: 200, height: 100, channels: 3, background: color } }).png().toBuffer()
const id = fnId('setCover', 'src/server/forms.ts')

async function upload(bytes, name = 'cover.png', type = 'image/png') {
  const body = new FormData()
  body.set('$fn', id)
  body.set('file', new File([bytes], name, { type }))
  return fetch(`${url}/cover`, { method: 'POST', redirect: 'manual', headers: { origin: url }, body })
}
const record = async () => (await (await fetch(`${url}/_weft/fn/${fnId('getCover', 'src/server/forms.ts')}`)).json()).v
const accepts = { avif: 'image/avif,image/webp,image/*,*/*;q=0.8', webp: 'image/webp,*/*;q=0.8', none: 'image/*,*/*;q=0.8' }

test('an upload stores the original and the query returns the record', async () => {
  expect((await upload(await png())).status).toBe(303)
  const r = await record()
  expect(r).toMatchObject({ kind: 'graphic', width: 200, height: 100, type: 'image/png', name: 'cover.png', quality: 'fixed' })
  expect(r.src).toMatch(/^\/_weft\/m\/[0-9a-f]{32}\/128\.auto$/) // the ladder caps the output
  expect(r.sources).toHaveLength(1)
  expect(r.sources[0].srcset).toMatch(/\/64\.auto 64w, .*\/128\.auto 128w$/)
  expect(r.dominant).toMatch(/^#[0-9a-f]{6}$/)
  expect(r.placeholder).toMatch(/^data:image\/webp/)
})

test('<Media> renders the record with no extra work', async () => {
  const html = await (await fetch(`${url}/cover`)).text()
  expect(html).toMatch(/<img[^>]* srcset="\/_weft\/m\/[0-9a-f]{32}\/64\.auto 64w/)
  expect(html).toMatch(/<img[^>]* width="200"/)
  expect(html).toMatch(/<img[^>]* height="100"/)
})

test('`auto` negotiates on Accept, in the config\'s order, with Vary', async () => {
  const { src } = await record()
  for (const [accept, type, magic] of [[accepts.avif, 'image/avif', 'ftyp'], [accepts.webp, 'image/webp', 'RIFF'], [accepts.none, 'image/png', 'PNG'], ['image/avif;q=0,image/webp', 'image/webp', 'RIFF']]) {
    const res = await fetch(url + src, { headers: { accept } })
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe(type)
    expect(res.headers.get('vary')).toBe('Accept')
    expect(res.headers.get('cache-control')).toBe('public, max-age=31536000, immutable')
    expect(res.headers.get('x-content-type-options')).toBe('nosniff')
    expect(Buffer.from(await res.arrayBuffer()).toString('latin1').slice(0, 12)).toContain(magic)
  }
})

test('a named format is served as named, a width resized, with an ETag and a 304', async () => {
  const { src } = await record()
  const base = src.replace(/\/\d+\.auto$/, '')
  const res = await fetch(`${url}${base}/64.webp`)
  expect(res.headers.get('content-type')).toBe('image/webp')
  expect(res.headers.get('vary') ?? '').not.toContain('Accept') // the dev server adds its own lower-case entries
  const meta = await sharp(Buffer.from(await res.arrayBuffer())).metadata()
  expect([meta.width, meta.height]).toEqual([64, 32])
  const again = await fetch(`${url}${base}/64.webp`, { headers: { 'if-none-match': res.headers.get('etag') } })
  expect(again.status).toBe(304)
})

test('only the ladder and the configured formats are served', async () => {
  const { src } = await record()
  const base = src.replace(/\/\d+\.auto$/, '')
  for (const path of [`${base}/65.webp`, `${base}/10000.auto`, `${base}/64.jpg`, `${base}/64.gif`, `/_weft/m/${'0'.repeat(32)}/64.auto`, '/_weft/m/..%2f..%2fetc/64.auto', '/_weft/m/x']) {
    expect((await fetch(url + path)).status).toBe(404)
  }
})

test('concurrent requests for one variant all get it', async () => {
  const { src } = await record()
  const base = src.replace(/\/\d+\.auto$/, '')
  const all = await Promise.all(Array.from({ length: 6 }, () => fetch(`${url}${base}/128.avif`).then(r => r.arrayBuffer())))
  expect(new Set(all.map(b => Buffer.from(b).toString('base64'))).size).toBe(1)
})

test('M018: what isn\'t an image comes back as the form\'s message', async () => {
  const res = await upload(Buffer.from('not an image'), 'x.png')
  expect(res.status).toBe(422)
  expect(await res.text()).toContain('isn&#39;t an image'.replace('&#39;', "'"))
})

test('M012: an SVG with a script is refused', async () => {
  const res = await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>'), 'x.svg', 'image/svg+xml')
  expect(res.status).toBe(422)
})

test('a safe SVG is served with a sandbox CSP', async () => {
  expect((await upload(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><rect width="10" height="10"/></svg>'), 'x.svg', 'image/svg+xml')).status).toBe(303)
  const r = await record()
  const res = await fetch(url + r.src)
  expect(res.headers.get('content-type')).toBe('image/svg+xml')
  expect(res.headers.get('content-security-policy')).toContain('sandbox')
})
