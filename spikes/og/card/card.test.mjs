// `node --test card/card.test.mjs` (Node 22). Builds the cards first: `node build-cards.mjs`.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createCardRenderer, cardResponse, previewHtml } from './index.mjs'
import { native } from './native.mjs'
import { wasm } from './wasm.mjs'
import { fontFormat, woffToSfnt } from './fonts.mjs'
import { defaultCard, avatarCard, stressCard } from '../build/cards.mjs'
import { props } from '../renderers.mjs'

const here = join(dirname(fileURLToPath(import.meta.url)), '..')
const bytes = (p) => new Uint8Array(readFileSync(join(here, p)))
const font = (dir, file, weight, style) => ({
  name: dir === 'inter' ? 'Inter' : 'Lora',
  data: bytes(`node_modules/@fontsource/${dir}/files/${file}`),
  weight,
  style,
})
const woff = [
  font('inter', 'inter-latin-400-normal.woff', 400, 'normal'),
  font('inter', 'inter-latin-700-normal.woff', 700, 'normal'),
  font('lora', 'lora-latin-400-italic.woff', 400, 'italic'),
]
const avatar = bytes('assets/avatar.jpg')

// A local image host: /avatar.jpg, /missing.jpg (404), /slow.jpg (answers after 2 s), /text (not an image).
let server,
  origin,
  hits = 0
before(async () => {
  server = createServer((req, res) => {
    hits++
    if (req.url === '/avatar.jpg')
      return res.writeHead(200, { 'content-type': 'image/jpeg' }).end(avatar)
    if (req.url === '/slow.jpg')
      return setTimeout(
        () => res.writeHead(200, { 'content-type': 'image/jpeg' }).end(avatar),
        2000,
      )
    if (req.url === '/text') return res.writeHead(200, { 'content-type': 'text/plain' }).end('hi')
    res.writeHead(404).end()
  })
  await new Promise((r) => server.listen(0, '127.0.0.1', r))
  origin = `http://127.0.0.1:${server.address().port}`
})
after(() => server.closeAllConnections() || server.close())

const local = { allow: (u) => u.hostname === '127.0.0.1', timeoutMs: 300 }
const backends = {
  native: () => native(),
  wasm: () => wasm(bytes('node_modules/@takumi-rs/wasm/pkg/takumi_wasm_bg.wasm')),
}
const cards = () => ({
  default: defaultCard(props.default),
  avatar: avatarCard({ ...props.avatar, avatar: `${origin}/avatar.jpg` }),
  stress: stressCard(props.stress),
})

test('native and wasm draw byte-identical cards, from WOFF fonts', async () => {
  const [n, w] = await Promise.all(
    Object.values(backends).map(async (b) =>
      createCardRenderer({ backend: await b(), fonts: woff, images: local }),
    ),
  )
  for (const [name, html] of Object.entries(cards())) {
    const [a, b] = await Promise.all([n.render(html), w.render(html)])
    assert.deepEqual(
      a.diagnostics.filter((d) => d.severity === 'error'),
      [],
      name,
    )
    assert.ok(Buffer.from(a.body).equals(Buffer.from(b.body)), `${name}: native and wasm differ`)
  }
})

test('WOFF unpacks to a valid SFNT with the same tables', async () => {
  const sfnt = await woffToSfnt(woff[0].data)
  assert.equal(fontFormat(woff[0].data), 'woff')
  assert.equal(fontFormat(sfnt), 'ttf')
  assert.equal(
    new DataView(sfnt.buffer).getUint16(4),
    new DataView(woff[0].data.buffer).getUint16(12),
  )
})

test('converted WOFF draws exactly what Takumi native draws from the WOFF itself', async () => {
  const b = await native()
  const card = await createCardRenderer({ backend: b, fonts: [woff[0]] }) // goes through woffToSfnt
  const raw = new b.Renderer()
  await raw.registerFont(woff[0]) // native reads WOFF directly
  const html =
    '<div style="display:flex;width:100%;height:100%;font-family:Inter;font-size:48px">Hamburgefonstiv 0123</div>'
  const { fromHtml } = await import('@takumi-rs/helpers/html')
  const direct = await raw.render(fromHtml(html).node, {
    width: 1200,
    height: 630,
    css: ['*,*::before,*::after{box-sizing:border-box}'],
  })
  assert.ok(Buffer.from((await card.render(html)).body).equals(Buffer.from(direct)))
})

test('SSR hole comments are removed, so no text is lost', async () => {
  const card = await createCardRenderer({ backend: await native(), fonts: woff })
  const style = 'display:flex;width:100%;height:100%;font-family:Inter;font-size:48px'
  const marked = await card.render(`<p style="${style}">Hello, <!--[-->Ada<!--]-->!<!--,--> Hi</p>`)
  const plain = await card.render(`<p style="${style}">Hello, Ada! Hi</p>`)
  assert.ok(Buffer.from(marked.body).equals(Buffer.from(plain.body)))
})

test('an invalid value is an M005 error, dropped, and the rest still renders', async () => {
  const card = await createCardRenderer({ backend: await native(), fonts: woff })
  const html =
    '<div style="display:flex;width:banana;background:#123;foo-bar:1;position:sticky">x</div>'
  const r = await card.render(html)
  assert.equal(r.type, 'image/png')
  assert.deepEqual(
    r.diagnostics.map((d) => [d.code, d.severity, d.message.split('`')[1]]),
    [
      ['M005', 'error', 'width: banana'],
      ['M005', 'warning', 'foo-bar'],
      ['M005', 'error', 'position: sticky'],
    ],
  )
  await assert.rejects(card.render(html, { strict: true }), /M005 `width: banana`/)
  assert.deepEqual(await card.check(html), r.diagnostics)
})

test('the spike cards have no M005 findings except what really has no effect', async () => {
  const card = await createCardRenderer({ backend: await native(), fonts: woff, images: local })
  for (const [name, html] of Object.entries(cards()))
    assert.deepEqual(await card.check(html), [], name)
})

test('images: fetched once, failures fall back to an empty box with M008', async () => {
  const card = await createCardRenderer({ backend: await native(), fonts: woff, images: local })
  const img = (src) =>
    `<div style="display:flex;width:100%;height:100%"><img src="${src}" width="120" height="120"><span style="font-family:Inter">after</span></div>`
  const before = hits
  await card.render(img(`${origin}/avatar.jpg`))
  await card.render(img(`${origin}/avatar.jpg`))
  assert.equal(hits - before, 1, 'second render is served from the cache')

  const blank = await card.render(img(`${origin}/missing.jpg`))
  for (const [src, reason] of [
    ['/missing.jpg', /HTTP 404/],
    ['/slow.jpg', /timed out after 300 ms/],
    ['/text', /not an image/],
  ]) {
    const r = await card.render(img(origin + src))
    assert.match(r.diagnostics[0].message, reason)
    assert.equal(r.diagnostics[0].code, 'M008')
    assert.ok(
      Buffer.from(r.body).equals(Buffer.from(blank.body)),
      `${src}: same layout as any failed image`,
    )
  }
  const strangers = await createCardRenderer({ backend: await native(), fonts: woff }) // default: https only
  assert.match(
    (await strangers.render(img(`${origin}/avatar.jpg`))).diagnostics[0].message,
    /not allowed/,
  )
})

test('formats, response headers and the preview page', async () => {
  const card = await createCardRenderer({ backend: await native(), fonts: woff })
  const html = cards().default
  const svg = await card.render(html, { format: 'svg' })
  assert.match(svg.body, /^<svg/)
  for (const [format, magic] of [
    ['png', [0x89, 0x50]],
    ['jpeg', [0xff, 0xd8]],
    ['webp', [0x52, 0x49]],
  ]) {
    const r = await card.render(html, { format, quality: 85 })
    assert.deepEqual([...r.body.subarray(0, 2)], magic, format)
  }
  const res = cardResponse(await card.render(html))
  assert.equal(res.headers.get('cache-control'), 'public, max-age=31536000, immutable')
  assert.equal(cardResponse(svg, { dev: true }).headers.get('cache-control'), 'no-store')
  const page = previewHtml('<p>a<!--[-->b<!--]--></p>', { fonts: woff })
  assert.match(
    page,
    /@font-face\{font-family:"Lora";font-weight:400;font-style:italic;src:url\(data:font\/woff;base64,/,
  )
  assert.match(page, /box-sizing:border-box/)
  assert.match(page, /<p>ab<\/p>/)
})
