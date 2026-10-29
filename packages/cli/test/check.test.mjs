import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { check } from '../src/check.mjs'
import { fixture, project, spreadBug } from './helpers.mjs'

const app = readFileSync(join(fixture, 'src/App.tsx'), 'utf8')

describe('weft check on evals/reference-v3/weft', () => {
  it('compiles every component and finds nothing in the reference', async () => {
    const r = await check(fixture)
    expect(r.ok).toBe(true)
    expect(r.files).toEqual(['src/App.tsx', 'src/components/CartView.tsx', 'src/components/Header.tsx', 'src/components/ProductList.tsx', 'src/components/ProductRow.tsx', 'src/main.tsx'])
    expect(r.diagnostics).toEqual([])
    expect(r.config).toBeNull()
    expect(r.weft.version).toBe('0.0.0')
  })

  it('reports slot bindings: defaults are named, never silent', async () => {
    const { slots } = await check(fixture)
    expect(slots).toEqual({
      'db.adapter': { drizzle: 'weft:default' },
      'font.build': null,
      'pay.rail': {},
      'realtime.bus': 'weft:default:memory',
      'surface.renderer': { canvas2d: 'weft:default', webgl2: 'weft:default' },
      'text.measure': null,
    })
  })
})

describe('project view: cross-file W014', () => {
  it('promotes the spread habit to an error when the box reaches a keyed list in another file', async () => {
    expect(app).toContain(spreadBug[0])
    const dir = project({ 'src/App.tsx': app.replace(...spreadBug) })
    const r = await check(dir)
    expect(r.ok).toBe(false)
    const [d] = r.diagnostics
    expect(r.diagnostics).toHaveLength(1)
    expect(d).toMatchObject({ code: 'W014', severity: 'error', project: true, file: 'src/App.tsx', docs: 'weft docs W014' })
    const text = readFileSync(join(dir, 'src/App.tsx'), 'utf8')
    expect(text.slice(...d.offset)).toMatch(/^products\.value\.map\(p => \(\{ \.\.\.p/)
    expect(d.span.slice(0, 2)).toEqual([21, 44])
    expect(d.why).toContain('src/components/ProductList.tsx:29')
    expect(d.related.map(x => [x.file, x.span[0], x.why])).toEqual([
      ['src/App.tsx', 43, 'passed as `<ProductList products>`'],
      ['src/components/ProductList.tsx', 29, 'rendered here as a keyed list'],
    ])
    expect(d.fix.text).toContain('p.id === id ? { ...p, price } : p')
  })

  it('keeps the warning when the box goes to a component that never lists it', async () => {
    const dir = project({
      'src/App.tsx': `import { state } from 'weft'
import { Count } from './Count'
export function App() {
  const xs = state([{ id: 'a', price: 1 }])
  const bump = () => { xs.value = xs.value.map(p => ({ ...p, price: p.price + 1 })) }
  return <Count items={xs.value} onBump={bump} />
}
`,
      'src/Count.tsx': `export function Count({ items, onBump }: { items: { id: string }[]; onBump: () => void }) {
  return <button onClick={onBump}>{items.length}</button>
}
`,
    })
    const r = await check(dir, { files: ['src/App.tsx', 'src/Count.tsx'] })
    expect(r.diagnostics.map(d => [d.code, d.severity, d.project ?? false])).toEqual([['W014', 'warning', false]])
  })

  it('follows props through derived and a second component', async () => {
    const dir = project({
      'src/App.tsx': `import { state } from 'weft'
import { Shell } from './Shell'
export function App() {
  const xs = state([{ id: 'a', price: 1 }])
  const bump = () => { xs.value = xs.value.map(p => ({ ...p, price: p.price + 1 })) }
  return <Shell rows={xs.value} onBump={bump} />
}
`,
      'src/Shell.tsx': `import { Table } from './Table'
export function Shell(props: { rows: { id: string; price: number }[]; onBump: () => void }) {
  return <main onClick={props.onBump}><Table items={props.rows} /></main>
}
`,
      'src/Table.tsx': `import { derived } from 'weft'
export function Table({ items }: { items: { id: string; price: number }[] }) {
  const sorted = derived(() => [...items].sort((a, b) => a.price - b.price))
  return <ul>{sorted.value.map(p => <li key={p.id}>{p.price}</li>)}</ul>
}
`,
    })
    const r = await check(dir, { files: ['src/App.tsx', 'src/Shell.tsx', 'src/Table.tsx'] })
    const [d] = r.diagnostics
    expect(d).toMatchObject({ code: 'W014', severity: 'error', project: true })
    expect(d.why).toContain('<Shell rows> → <Table items>')
    expect(d.related.at(-1)).toMatchObject({ file: 'src/Table.tsx', span: [4, 15, 4, 15] })
  })
})

describe('diagnostic shape', () => {
  it('converts byte offsets to UTF-16 lines and columns, with edits for autofixes', async () => {
    const dir = project({ 'src/Badge.tsx': `import { state } from 'weft'\n// é ü 🎉\nexport function Badge() {\n  const n = state(0)\n  return <p title="é🎉">{n}</p>\n}\n` })
    const r = await check(dir, { files: ['src/Badge.tsx'] })
    const [d] = r.diagnostics
    const text = readFileSync(join(dir, 'src/Badge.tsx'), 'utf8')
    expect(d.code).toBe('W015')
    expect(text.slice(...d.offset)).toBe('n')
    expect(d.span).toEqual([5, 26, 5, 27]) // `🎉` is two UTF-16 units, `é` two UTF-8 bytes
    expect(d.fix.safe).toBe(true)
    const [edit] = d.fix.edits
    const fixed = text.slice(0, edit.offset[0]) + edit.text + text.slice(edit.offset[1])
    expect(fixed).toContain('{n.value}')
  })

  it('reports P002 for package.json scripts that are not weft aliases', async () => {
    const dir = project({ 'package.json': JSON.stringify({ scripts: { dev: 'weft dev', seed: 'node seed.mjs' } }, null, 2) })
    const r = await check(dir)
    expect(r.diagnostics.map(d => [d.code, d.file, d.span[0]])).toEqual([['P002', 'package.json', 4]])
    expect(r.ok).toBe(true)
  })

  it('reports P120 for a weft plugin wired straight into vite.config.ts', async () => {
    const dir = project({ 'vite.config.ts': "import { text } from '@weft/plugin-text'\nexport default { plugins: [text().vite] }\n" })
    const r = await check(dir)
    expect(r.diagnostics.map(d => [d.code, d.file, d.span])).toEqual([['P120', 'vite.config.ts', [1, 23, 1, 40]]])
  })

  it('never compiles files under scope.forbid', async () => {
    const dir = project({
      'weft.config.ts': "import { defineConfig } from 'weft/config'\nexport default defineConfig({ scope: { forbid: ['src/components/**'] } })\n",
    })
    const r = await check(dir)
    expect(r.files).toEqual(['src/App.tsx', 'src/main.tsx'])
  })
})
