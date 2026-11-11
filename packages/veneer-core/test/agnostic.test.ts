// @vitest-environment node
// veneer-core is the framework-agnostic layer: plain TS over the DOM. Nothing in src may import kerf, React, Preact,
// Solid, Vue or Svelte, or contain JSX, so another binding can sit on it unchanged.
// The shared markup entry is string processing; its complete import graph is checked below.
import { readFileSync, readdirSync } from 'node:fs'
import { standaloneMarkup } from '../../../scripts/quality/boundaries.mjs'

const src = new URL('../src/', import.meta.url)
const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) =>
  /\.[mc]?[jt]sx?$/.test(f),
)

test('no framework imports and no JSX in veneer-core/src', () => {
  expect(files.length).toBeGreaterThan(0)
  expect(standaloneMarkup()).toBe(true)
  for (const f of files) {
    expect(f, 'no .tsx/.jsx files').not.toMatch(/x$/)
    const text = readFileSync(new URL(f, src), 'utf8')
    const specifiers = [
      ...text.matchAll(
        /^\s*(?:import|export)\b[^;\n]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm,
      ),
    ].map((m) => m[1] ?? m[2] ?? m[3])
    for (const s of specifiers)
      expect(s, `${f} imports ${String(s)}`).toMatch(/^(?:\.\.?\/|@kerf\/core\/markup$)/)
  }
})

test('the package requires no framework: kerf is an optional peer, for the one binding that needs it', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  expect(pkg.dependencies ?? {}).toEqual({})
  expect(Object.keys(pkg.peerDependencies)).toEqual(['@kerf/core'])
  expect(pkg.peerDependenciesMeta['@kerf/core'].optional).toBe(true)
})

test('src never reaches the binding, so the main entry stays framework-free', () => {
  for (const f of files) expect(readFileSync(new URL(f, src), 'utf8'), f).not.toMatch(/bindings\//)
})

test('the binding is the only other code, and all it imports is kerf and its own types', () => {
  const text = readFileSync(new URL('../bindings/kerf.ts', import.meta.url), 'utf8')
  const specifiers = [...text.matchAll(/^import\b.*?from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1])
  expect(specifiers).toEqual(['@kerf/core', '../src/store'])
})
