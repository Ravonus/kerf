import { describe, expect, test } from 'vitest'
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

test('a streamed chunk never links a sheet the head already asked for: it brings the rules it reaches, once', () => {
  const s = pageStyles(assets, css, html)
  const first = s.late([{ href: '/a.css' }], '<template><div data-scope="menu"></div></template>')
  expect(first).not.toContain('<link')
  expect(first).toContain('data-scope="menu"')
  expect(first).not.toContain('color:green') // the head sent the card's rules
  expect(s.late([], '<template><div data-scope="menu"></div></template>')).toBe('')
})

test('a chunk\'s rules go in front of the head\'s sheets, so those keep winning once they load', () => {
  const s = pageStyles(assets, css, html)
  expect(s.late([], '<div data-scope="menu"></div>')).toMatch(/<\/style><script>.*link\[rel=stylesheet\].*l\.before\(s\).*previousElementSibling\)<\/script>\n$/)
})

test('a sheet the head lacks is still a blocking link, once', () => {
  const s = pageStyles(assets, css, html)
  expect(s.late([{ href: '/island.css' }], '')).toBe('<link rel="stylesheet" href="/island.css">\n')
  expect(s.late([{ href: '/island.css' }], '')).toBe('')
})

test('a token only a chunk reads comes with that chunk, though the head cut it', () => {
  const sheet = `:root{--used:1;--late:2}:where([data-scope="card"]){color:var(--used)}:where([data-scope="menu"]){color:var(--late)}${filler(4000)}`
  const s = pageStyles({ inline: { '/tokens.css': sheet }, critical }, [{ href: '/tokens.css' }], html)
  expect(s.late([], '<div data-scope="menu"></div>')).toContain('--late:2')
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

describe('a static route through a kit barrel', () => {
  const kit = async (files, page) => {
    const root = mkdtempSync(join(tmpdir(), 'weft-kit-')), dir = join(root, 'node_modules/@weft/kit/src')
    for (const [f, text] of Object.entries(files)) { mkdirSync(dirname(join(dir, f)), { recursive: true }); writeFileSync(join(dir, f), text) }
    const ctx = { resolve: async (spec, from) => ({ id: spec === '@weft/kit' ? join(dir, 'index.ts') : resolve(dirname(from), spec.endsWith('.css') ? spec : `${spec}.tsx`) }) }
    return assetsOnly(ctx, page, join(root, 'src/routes/a.tsx'), root)
  }
  const Modal = { 'Modal.tsx': `import './modal.css'\nexport const Modal = () => null\n` }

  test('finds a component in a second declarator', async () => {
    const page = await kit({ 'index.ts': `export { Badge } from './pills'\nexport { Modal } from './Modal'\n`, ...Modal, 'pills.tsx': `import { p } from './inner'\nexport const Pill = () => p, Badge = () => p\n`, 'inner.tsx': `import './pills.css'\nexport const p = 1\n` }, `import { Badge } from '@weft/kit'\n`)
    expect(page).toContain('pills.css')
    expect(page).not.toContain('modal')
  })

  test('finds a component in a destructured export', async () => {
    expect(await kit({ 'index.ts': `export { Badge } from './pills'\n`, 'pills.tsx': `import { p } from './inner'\nexport const { Badge } = p\n`, 'inner.tsx': `import './pills.css'\nexport const p = 1\n` }, `import { Badge } from '@weft/kit'\n`)).toContain('pills.css')
  })

  test('keeps what a barrel imports for its side effects, and not what it imports for a name', async () => {
    const page = await kit({ 'index.ts': `import './base.css'\nimport './setup'\nimport { used } from './helper'\nexport { Modal } from './Modal'\nexport const count = used\n`, ...Modal, 'setup.tsx': `import './setup.css'\n`, 'helper.tsx': `import './helper.css'\nexport const used = 1\n` }, `import { Modal } from '@weft/kit'\n`)
    expect(page).toContain('base.css')
    expect(page).toContain('setup.css')
    expect(page).toContain('modal.css')
    expect(page).not.toContain('helper.css')
  })

  test('follows `export * as K` only for K, and takes all of it', async () => {
    const files = { 'index.ts': `export * as K from './k'\nexport { Modal } from './Modal'\n`, ...Modal, 'k.tsx': `import { b } from './b'\nexport const a = b\n`, 'b.tsx': `import './k.css'\nexport const b = 1\n` }
    expect(await kit(files, `import { K } from '@weft/kit'\n`)).toContain('k.css')
    expect(await kit(files, `import { Modal } from '@weft/kit'\n`)).not.toContain('k.css')
  })
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

describe('the first paint keeps a rule whenever the shell might match it', () => {
  let sheets = 0
  const first = (rule, html) => {
    const href = `/c${sheets++}.css` // hashed in a build, so one name is one sheet
    const page = pageStyles({ inline: { [href]: `${rule}${filler(4000)}` }, critical }, [{ href }], html).head
    return /<style>(?!@layer warp,)([\s\S]*?)<\/style>/.exec(page)[1]
  }
  const keeps = [
    ['a state under :not()', `[data-part="label"]:not(:hover, :focus-within){top:1px}`, '<i data-part="label"></i>'],
    ['a :hover alternative that may not apply', `:is(.a:hover,.a){top:1px}`, '<i class="a"></i>'],
    ['a state word inside a value', `[data-x=":hover"]{top:1px}`, '<i data-x=":hover"></i>'],
    ['a suffix', `[data-part$="corners"]{top:1px}`, '<i data-part="frame-corners"></i>'],
    ['a prefix', `[data-delta^="up"]{top:1px}`, '<i data-delta="up-3"></i>'],
    ['a substring', `[data-k*="id"]{top:1px}`, '<i data-k="mid"></i>'],
    ['a value in a list', `[data-k~="b"]{top:1px}`, '<i data-k="a b"></i>'],
    ['a dash prefix', `[data-k|="en"]{top:1px}`, '<i data-k="en-GB"></i>'],
    ['a value with a space', `[data-k="a b"]{top:1px}`, '<i data-k="a b"></i>'],
    ['a value with an operator on a kept attribute', `[data-tone$="x"]{top:1px}`, '<i data-tone="bx"></i>'],
    ['the case-insensitive flag', `[data-k="ABC" i]{top:1px}`, '<i data-k="abc"></i>'],
    ['an escaped class', `.md\\:grid{top:1px}`, '<i class="md:grid"></i>'],
    ['a hex-escaped class', `.\\31 23{top:1px}`, '<i class="123"></i>'],
    ['a value the shell writes as a reference', `[data-k="abc"]{top:1px}`, '<i data-k="&#97;bc"></i>'],
    ['a single-quoted value', `[data-k="abc"]{top:1px}`, `<i data-k='abc'></i>`],
    ['an unquoted value', `[data-k="abc"]{top:1px}`, '<i data-k=abc></i>'],
    ['a single-quoted class', `.abc{top:1px}`, `<i class='abc'></i>`],
    ['an attribute name in another case', `[data-kay="abc"]{top:1px}`, '<i DATA-KAY="abc"></i>'],
    ['a dot inside an attribute value', `[data-k$=".pdf"]{top:1px}`, '<i data-k="a.pdf"></i>'],
    ['a non-data attribute with a dot', `a[href$=".pdf"]{top:1px}`, '<a href="a.pdf"></a>'],
    ['a list with print in it', `@media print,screen{.a{top:1px}}`, '<i class="a"></i>'],
    ['forced-colors off', `@media (forced-colors:none){.a{top:1px}}`, '<i class="a"></i>'],
    ['a bracket inside a value', `[data-k="a)"],.a{top:1px}`, '<i class="a"></i>'],
  ]
  test.each(keeps)('%s', (_, rule, html) => { expect(first(rule, html)).toContain('top:1px') })

  const drops = [
    ['a plain value the shell lacks', `[data-k="abc"]{top:1px}`, '<i data-k="abd"></i>'],
    ['an attribute the shell lacks, with an operator', `[data-gone$="x"]{top:1px}`, '<i data-k="x"></i>'],
    ['a class the shell lacks', `.gone{top:1px}`, '<i class="a"></i>'],
    ['a real hover', `.a:hover{top:1px}`, '<i class="a"></i>'],
    ['print alone', `@media print{.a{top:1px}}`, '<i class="a"></i>'],
    ['forced colours', `@media (forced-colors:active){.a{top:1px}}`, '<i class="a"></i>'],
  ]
  test.each(drops)('but not %s', (_, rule, html) => { expect(first(rule, html)).not.toContain('top:1px') })
})

test('text in a page that names a custom property nothing reads does not split the cache', () => {
  const a = pageStyles(assets, css, `${html}<p>--one</p>`).head
  expect(pageStyles(assets, css, `${html}<p>--two</p>`).head).toBe(a)
  expect(pageStyles({ inline: { '/d.css': `:where([data-scope="card"]){--warp-gap:1px}${big}` }, critical }, [{ href: '/d.css' }], `${html}<i style="--warp-gap:2px"></i>`).head).toContain('--warp-gap:1px')
})

test('the budget counts the head an app adds, not just the shell', () => {
  const sheet = '.a{color:red}'.repeat(2000)
  const size = sheet.length / 6, s = 'x'.repeat(4 * (12 * 1024 - size) - 400)
  const a = { inline: { '/a.css': sheet }, critical }
  expect(pageStyles(a, css, s).head).not.toContain('media="print"')
  expect(pageStyles(a, css, s, 'y'.repeat(1000)).head).toContain('media="print"')
})
