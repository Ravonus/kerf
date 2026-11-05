// @vitest-environment node
// warp-core is the framework-agnostic layer: plain TS over the DOM. Nothing in src may import weft, React, Preact,
// Solid, Vue or Svelte, or contain JSX, so another binding can sit on it unchanged.
// The shared markup entry is string processing; its complete import graph is checked below.
import { readFileSync, readdirSync } from 'node:fs'
import { standaloneMarkup } from '../../../scripts/quality/boundaries.mjs'

const src = new URL('../src/', import.meta.url)
const files = readdirSync(src, { recursive: true, encoding: 'utf8' }).filter((f) =>
  /\.[mc]?[jt]sx?$/.test(f),
)

test('no framework imports and no JSX in warp-core/src', () => {
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
      expect(s, `${f} imports ${String(s)}`).toMatch(/^(?:\.\.?\/|@weft-js\/core\/markup$)/)
  }
})

test('the package requires no framework: weft is an optional peer, for the one binding that needs it', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  expect(pkg.dependencies ?? {}).toEqual({})
  expect(Object.keys(pkg.peerDependencies)).toEqual(['@weft-js/core'])
  expect(pkg.peerDependenciesMeta.weft.optional).toBe(true)
})

test('src never reaches the binding, so the main entry stays framework-free', () => {
  for (const f of files) expect(readFileSync(new URL(f, src), 'utf8'), f).not.toMatch(/bindings\//)
})

test('the binding is the only other code, and all it imports is weft and its own types', () => {
  const text = readFileSync(new URL('../bindings/weft.ts', import.meta.url), 'utf8')
  const specifiers = [...text.matchAll(/^import\b.*?from\s*['"]([^'"]+)['"]/gm)].map((m) => m[1])
  expect(specifiers).toEqual(['@weft-js/core', '../src/store'])
})
