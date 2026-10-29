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
