// @vitest-environment node
// The warp plugin: seed → tokens (gated by the spec's own contrast checker), classic fields, catalog and AGENTS text.
import { readFileSync } from 'node:fs'
import { dtcg, warp } from '../plugin.mjs'

const run = opts => warp(opts).contribute({ command: 'build', mode: 'production', root: '' })
const code = fn => { try { fn() } catch (e) { return e.code } }

test('the default seed adds no CSS; the catalog names every export; the AGENTS section fits in 1 KB', () => {
  const out = run()
  expect(out.tokens.css).toBeUndefined()
  expect(out.tokens.values.fields).toBe('floating')
  const index = readFileSync(new URL('../src/index.ts', import.meta.url), 'utf8')
  for (const c of out.catalog) expect(index, c.name).toMatch(new RegExp(`\\b${c.name}\\b`))
  expect(out.catalog.map(c => c.name)).toEqual(expect.arrayContaining(['Button', 'Toggle', 'Input', 'Select', 'Tabs', 'Modal', 'Toaster']))
  expect(Buffer.byteLength(out.agents.text)).toBeLessThanOrEqual(1024)
})

test('a seed that passes the spec checker at every stop becomes two token overrides', () => {
  const out = run({ seed: { hue: 180, chroma: 0.1 } })
  expect(out.tokens.css).toBe('@layer warp.tokens{:root{--warp-seed-accent-h:180;--warp-seed-accent-c:0.1}}\n')
  expect(run({ seed: { accent: '#0a7d4f' } }).tokens.css).toBe('@layer warp.tokens{:root{--warp-seed-accent-h:158.6;--warp-seed-accent-c:0.118}}\n')
}, 30_000)

// The checker covers both themes at every expression, so a hue passing here passes in light and dark.
test.each([0.03, 0.115, 0.2, 0.37])('every hue passes at chroma %d', chroma => {
  for (let hue = 0; hue < 360; hue += 15) expect(code(() => run({ seed: { hue, chroma } })), `hue ${hue}`).toBeUndefined()
}, 120_000)

test('every primary brand hex passes', () => {
  for (const accent of ['#ff0000', '#ffff00', '#00ff00', '#00ffff', '#0000ff', '#ff00ff', '#ff6a00', '#6a00ff']) expect(code(() => run({ seed: { accent } })), accent).toBeUndefined()
}, 60_000)

test('a hue outside the default\'s window keeps its hue and chroma: only the lightness of two tokens moves', () => {
  const css = run({ seed: { hue: 270, chroma: 0.115 } }).tokens.css
  expect(css).toContain('--warp-seed-accent-h:270;--warp-seed-accent-c:0.115')
  expect(css).toMatch(/--warp-color-sweep:light-dark\( ?oklch\(0\.5[2-5]\d? min\(max\(calc\(var\(--_ac\) \* 1\.25\), 0\.12\), 0\.13\) var\(--_ah\)\), oklch\(0\.6 /)
  expect(css).toMatch(/--warp-color-accent-text:light-dark\(oklch\(0\.46 min\(var\(--_ac\), 0\.12\) var\(--_ah\)\), oklch\(0\.8\d* var\(--_ac\) var\(--_ah\)\)\)/)
}, 30_000)

test('a token that breaks contrast with a seed is D010, listing the pairs; an invalid seed is weft\'s option error (P115)', () => {
  let err
  try { run({ seed: { hue: 20, chroma: 0.2 }, tokens: { '--warp-color-accent-solid': '#ffffff' } }) } catch (e) { err = e }
  expect(err?.code).toBe('D010')
  expect(err.failures.length).toBeGreaterThan(0)
  expect(code(() => run({ seed: { hue: 400, chroma: 0.1 } }))).toBe('P115')
  expect(code(() => run({ seed: { accent: 'green' } }))).toBe('P115')
}, 30_000)

test('fields: "classic" re-scopes the spec\'s classic rules to the root, inside their layers', () => {
  const css = run({ fields: 'classic' }).tokens.css
  expect(css).toMatch(/^@layer warp\./)
  expect(css).toContain(':root:not([data-fields="floating"])')
  expect(css).not.toContain('[data-fields="classic"]')
})

test('dials become the default at the root, and markup on <html> still wins', () => {
  const css = run({ dials: { density: 'compact', expression: 'quiet' } }).tokens.css
  expect(css).toContain(':root:not([data-density]){--warp-density-k: 0.75')
  expect(css).toContain(':root:not([data-expression])')
  expect(css).not.toContain('[data-density="compact"]')
})

test('radius, fonts and tokens land on every scope, in a layer after the dial stops', () => {
  const css = run({ radius: 'round', fonts: { body: 'Inter', mono: 'Menlo, monospace' }, tokens: { '--warp-space-page': '20px' } }).tokens.css
  expect(css).toMatch(/^@layer warp\.base\{:root,\[data-expression\]/)
  expect(css).toContain('--warp-radius-control:14px')
  expect(css).toContain('--warp-font-sans:"Inter", ui-sans-serif')
  expect(css).toContain('--warp-font-mono:Menlo, monospace')
  expect(css).toContain('--warp-space-page:20px')
})

test('a token that breaks contrast fails D010 like a bad seed', () => {
  expect(code(() => run({ tokens: { '--warp-color-page': '#fafafa' } }))).toBe('D010') // dark text-on-page goes
  expect(code(() => run({ tokens: { '--warp-color-text': '#ffffff', '--warp-color-page': '#ffffff' } }))).toBe('D010')
  expect(code(() => run({ tokens: { '--warp-color-accent-solid': '#ffffff' } }))).toBe('D010')
})

test('a token in the config beats the fitted one', () => {
  const sweep = 'light-dark(oklch(0.53 0.13 270), oklch(0.6 0.155 270))'
  const css = run({ seed: { hue: 270, chroma: 0.115 }, tokens: { '--warp-color-sweep': sweep } }).tokens.css
  expect(css).toContain(`--warp-color-sweep:${sweep}`)
  expect(css.match(/--warp-color-sweep:/g)).toHaveLength(1)
}, 30_000)

test.each([
  [{ dials: { nope: 'x' } }, 'dials.nope'],
  [{ dials: { density: 'huge' } }, 'dials.density'],
  [{ radius: 'pill' }, 'radius'],
  [{ fonts: { body: 'x;}' } }, 'fonts.body'],
  [{ tokens: { color: 'red' } }, 'tokens.color'],
  [{ tokens: { '--warp-color-page': 'red' } }, 'tokens.--warp-color-page'],
])('rejects %j', (input, path) => {
  let error
  try {
    warp(input)
  } catch (e) {
    error = e
  }
  expect(error).toMatchObject({ code: 'P115', path })
})

test('dtcg: every theme × expression, DTCG colours and dimensions, and a resolver over them', () => {
  const files = dtcg()
  expect(Object.keys(files)).toHaveLength(7)
  const light = files['warp.light.quiet.tokens.json']
  expect(light.color.$type).toBe('color')
  expect(light.color.text.$value.colorSpace).toBe('srgb')
  expect(light.color.text.$value.hex).toMatch(/^#[0-9a-f]{6}$/)
  expect(light.space.group.$value).toEqual({ value: 16, unit: 'px' })
  expect(light.radius.control.$value.value).toBe(8)
  expect(files['warp.dark.vivid.tokens.json'].radius.control.$value.value).toBe(2)
  expect(Object.keys(files['warp.resolver.json'].modifiers.mode.contexts)).toHaveLength(6)
  expect(files['warp.dark.quiet.tokens.json'].color.text.$value.hex).not.toBe(light.color.text.$value.hex)
})
test('dtcg: the seed reaches the tokens', () => {
  const css = run({ seed: { hue: 20, chroma: 0.12 } }).tokens.css
  expect(dtcg(css)['warp.light.quiet.tokens.json'].color['accent-solid'].$value.hex).not.toBe(dtcg()['warp.light.quiet.tokens.json'].color['accent-solid'].$value.hex)
})

test('share cards get warp`s colours, in both schemes, readable, and the theme dial picks one', () => {
  const { card } = run()
  expect(card.scheme).toBe('dark')
  expect(run({ dials: { theme: 'light' } }).card.scheme).toBe('light')
  expect(run({ seed: { hue: 20, chroma: 0.1 } }).card.dark.accent).not.toBe(card.dark.accent)
  const lum = hex => {
    const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4))
    return 0.2126 * r + 0.7152 * g + 0.0722 * b
  }
  const contrast = (a, b) => (Math.max(lum(a), lum(b)) + 0.05) / (Math.min(lum(a), lum(b)) + 0.05)
  for (const c of [card.dark, card.light]) {
    expect(contrast(c.text, c.background)).toBeGreaterThan(7)
    expect(contrast(c.subtle, c.background)).toBeGreaterThan(4.5)
    expect(contrast(c.accent, c.background)).toBeGreaterThan(3)
  }
})
