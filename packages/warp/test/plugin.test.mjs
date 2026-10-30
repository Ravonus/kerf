// @vitest-environment node
// The warp plugin: seed → tokens (gated by the spec's own contrast checker), classic fields, catalog and AGENTS text.
import { readFileSync } from 'node:fs'
import { warp } from '../plugin.mjs'

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

test('a seed that fails contrast somewhere is D010, listing the pairs; an invalid seed is weft\'s option error (P115)', () => {
  let err
  try { run({ seed: { hue: 20, chroma: 0.2 } }) } catch (e) { err = e }
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

test('a token can rescue a seed outside the sweep window', () => {
  const seed = { hue: 270, chroma: 0.115 }
  expect(code(() => run({ seed }))).toBe('D010')
  expect(code(() => run({ seed, tokens: { '--warp-color-sweep': 'light-dark(oklch(0.53 0.13 270), oklch(0.6 0.155 270))' } }))).toBeUndefined()
})

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
