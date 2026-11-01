import { readFileSync } from 'node:fs'
// The first-paint budget, on rules weft's own purge reads.
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { parse, purge } from '../../weft/node/purge.mjs'
import { assetsOnly } from '../src/vite.mjs'
import { FIRST_PAINT_BYTES, LAYER_ORDER, pageStyles } from '../src/inline.mjs'

const critical = { parse, purge }
const filler = n => Array.from({ length: n }, (_, i) => `:where([data-scope="unused${i}"]){color:red}`).join('')
const big = `:where([data-scope="card"]){color:red}:where([data-scope="card"]):hover{color:blue}:where([data-scope="card"][aria-checked="true"]){color:green}:where([data-scope="menu"]){color:pink}@media (forced-colors:active){:where([data-scope="card"]){color:Canvas}}${filler(2000)}`
const assets = { inline: { '/a.css': big }, critical }
const css = [{ href: '/a.css' }]
const html = '<div data-scope="card"></div>'

test('the layer order comes before every sheet, with or without inlining', () => {
  for (const a of [assets, { inline: {} }, {}]) expect(pageStyles(a, css, html).head.indexOf(`<style>${LAYER_ORDER}</style>`)).toBe(0)
})

test('a page that fits the first flight carries its sheets whole', () => {
  const { head } = pageStyles({ inline: { '/a.css': 'a{color:red}' }, critical }, css, html)
  expect(head).toContain('<style>a{color:red}</style>\n<link rel="stylesheet" href="/a.css" disabled>')
})

test('past the budget it carries what its HTML reaches, and the sheet follows without holding the paint', () => {
  expect(big.length / 6).toBeGreaterThan(FIRST_PAINT_BYTES)
  const { head } = pageStyles(assets, css, html)
  expect(head).toContain('[data-scope="card"]') // purge's flattening keeps the scope
  expect(head).not.toContain('unused')
  expect(head).not.toContain('"menu"')
  expect(head).toContain('media="print" onload="this.media=\'all\'"')
  expect(head).toContain('<noscript><link rel="stylesheet" href="/a.css"></noscript>')
})

test('interaction and forced-colours rules wait for the late sheet; a state the server renders does not', () => {
  const { head } = pageStyles(assets, css, html)
  expect(head).not.toContain(':hover')
  expect(head).not.toContain('forced-colors')
  expect(head).toContain('aria-checked')
})

test('a sheet that cannot be inlined stays a blocking link', () => {
  expect(pageStyles({ inline: { '/a.css': big }, critical }, [...css, { href: '/b.css' }], html).head).toMatch(/<link rel="stylesheet" href="\/b\.css">\n/)
})

test('dials the head restores before paint keep their rules', () => {
  const dials = `:where([data-expression="vivid"]){color:red}${big}`
  const a = { inline: { '/a.css': dials }, critical }
  expect(pageStyles(a, css, html, 'warp:dials').head).toContain('vivid')
  expect(pageStyles(a, css, html).head).not.toContain('vivid')
})

test('a streamed chunk gets each deferred sheet and each new island sheet once, as blocking links', () => {
  const s = pageStyles(assets, css, html)
  expect(s.late([{ href: '/a.css' }, { href: '/island.css' }])).toBe('<link rel="stylesheet" href="/a.css">\n<link rel="stylesheet" href="/island.css">\n')
  expect(s.late([{ href: '/island.css' }])).toBe('')
})

test('a whole-inline page has nothing deferred, so a chunk adds only what the head lacked', () => {
  const s = pageStyles({ inline: { '/a.css': 'a{}' }, critical }, css, html)
  expect(s.late([{ href: '/a.css' }])).toBe('')
  expect(s.late([{ href: '/island.css' }])).toBe('<link rel="stylesheet" href="/island.css">\n')
})

test('the layer order names warp\'s own layers, as warp.css does, so no component sheet can rank first', () => {
  const spec = /@layer (warp\.tokens,[^;]+);/.exec(readFileSync(new URL('../../ui-core/styles/warp.css', import.meta.url), 'utf8'))[1].replace(/\s/g, '')
  expect(LAYER_ORDER).toContain(`@layer ${spec};`)
})

test('a static route from an install keeps the stylesheets of the kit components it names, and only those', async () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-kit-'))
  const kit = join(root, 'node_modules/@weft/kit/src')
  const write = (f, text) => { mkdirSync(dirname(join(kit, f)), { recursive: true }); writeFileSync(join(kit, f), text) }
  write('index.ts', `export { Badge } from './Badge'\nexport { Modal } from './Modal'\n`)
  write('Badge.tsx', `import './badge.css'\nexport const Badge = () => null\n`)
  write('Modal.tsx', `import './modal.css'\nexport const Modal = () => null\n`)
  const ctx = { resolve: async (spec, from) => ({ id: spec === '@weft/kit' ? join(kit, 'index.ts') : resolve(dirname(from), spec.endsWith('.css') ? spec : `${spec}.tsx`) }) }
  const page = await assetsOnly(ctx, `import { Badge } from '@weft/kit'\n`, join(root, 'src/routes/a.tsx'), root)
  expect(page).toContain(JSON.stringify(join(kit, 'badge.css')))
  expect(page).not.toContain('modal')
})

test('the first paint leaves out rules for classes, attributes and values the shell doesn\'t have, not a :where alternative', () => {
  const sheet = `.plan{color:red}.hero{color:blue}:where([data-role=eyebrow]){color:red}:where([data-role=lede]){color:blue}[data-state=open]{color:red}:where(.gone,.hero){margin:0}:not(.gone){padding:0}${filler(4000)}`
  const page = pageStyles({ inline: { '/b.css': sheet }, critical }, [{ href: '/b.css' }], '<p class="hero" data-role="lede" data-id="7"></p>').head
  const inline = /<style>(?!@layer warp,)([\s\S]*?)<\/style>/.exec(page)[1]
  expect(inline).toContain('.hero{color:blue}')
  expect(inline).toContain('data-role=lede')
  expect(inline).toContain(':where(.hero){margin:0}')
  expect(inline).toContain(':not(.gone)')
  for (const gone of ['.plan', 'eyebrow', 'data-state']) expect(inline).not.toContain(gone)
})
