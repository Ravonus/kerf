// @vitest-environment node
// ui-core is the framework-agnostic layer: plain TS over the DOM. Nothing in it may import weft, React, Preact,
// Solid, Vue or Svelte, or contain JSX, so another binding can sit on it unchanged.
import { readFileSync, readdirSync } from 'node:fs'

const src = new URL('../src/', import.meta.url)
const files = readdirSync(src, { recursive: true }).filter(f => /\.[mc]?[jt]sx?$/.test(f))

test('no framework imports and no JSX in ui-core/src', () => {
  expect(files.length).toBeGreaterThan(0)
  for (const f of files) {
    expect(f, 'no .tsx/.jsx files').not.toMatch(/x$/)
    const text = readFileSync(new URL(f, src), 'utf8')
    const specifiers = [...text.matchAll(/^\s*(?:import|export)\b[^;\n]*?\bfrom\s*['"]([^'"]+)['"]|^\s*import\s*['"]([^'"]+)['"]|\bimport\(\s*['"]([^'"]+)['"]\s*\)/gm)].map(m => m[1] ?? m[2] ?? m[3])
    for (const s of specifiers) expect(s, `${f} imports ${s}`).toMatch(/^\.\.?\//)
  }
})

test('the package declares no framework dependency', () => {
  const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'))
  const deps = { ...pkg.dependencies, ...pkg.peerDependencies }
  expect(Object.keys(deps)).toEqual([])
})
