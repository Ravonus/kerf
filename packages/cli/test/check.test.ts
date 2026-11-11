import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { entry } from '../src/catalog.mjs'
import { check } from '../src/check.mjs'
import { schemaHash } from '../src/start.mjs'
import { fixture, project, spreadBug } from './helpers.mjs'

const app = readFileSync(join(fixture, 'src/App.tsx'), 'utf8')

describe('kerf check on evals/reference-v3/kerf', () => {
  it('compiles every component and finds nothing in the reference', async () => {
    const r = await check(fixture)
    expect(r.ok).toBe(true)
    expect(r.files).toEqual([
      'src/App.tsx',
      'src/components/CartView.tsx',
      'src/components/Header.tsx',
      'src/components/ProductList.tsx',
      'src/components/ProductRow.tsx',
      'src/main.tsx',
    ])
    expect(r.diagnostics).toEqual([])
    expect(r.config).toBeNull()
    expect(r.kerf.version).toBe('0.1.0')
  })

  it('reports slot bindings: defaults are named, never silent', async () => {
    const { slots } = await check(fixture)
    expect(slots).toEqual({
      'db.adapter': { drizzle: 'kerf:default' },
      'font.build': null,
      'media.build': null,
      'media.encode': {},
      'media.server': null,
      'pay.rail': {},
      'server.extension': {},
      'realtime.bus': 'kerf:default:memory',
      'surface.renderer': { canvas2d: 'kerf:default', webgl2: 'kerf:default' },
      'text.measure': null,
    })
  })
})

describe('project view: cross-file W014', () => {
  registerProjectAliasTests()
  registerProjectFlowTests()
})

describe('diagnostic shape', () => {
  registerDiagnosticPositionTests()
  registerDiagnosticScopeTests()
})

describe('Q015', () => {
  const db = {
    'drizzle.config.ts': 'export default {}\n',
    'src/db/schema.ts': 'export const a = 1\n',
  }
  const q015 = async (dir: string) =>
    (await check(dir)).diagnostics.filter((d) => d.code === 'Q015')

  it('no migrations yet, then the schema drifting from the recorded hash', async () => {
    const dir = project(db)
    expect((await q015(dir))[0].why).toContain('No migrations yet')
    mkdirSync(join(dir, 'drizzle'))
    writeFileSync(join(dir, 'drizzle/.schema-hash'), schemaHash(db['src/db/schema.ts']))
    expect(await q015(dir)).toEqual([])
    writeFileSync(join(dir, 'src/db/schema.ts'), 'export const a = 2\n')
    expect((await q015(dir))[0].why).toContain('changed since')
  })

  it('an app with no database has nothing to report', async () => {
    expect(await q015(project())).toEqual([])
  })
})

describe('what a build reports to kerf check', () => {
  const folder = new URL('../../core/node/', import.meta.url)
  const sources = [
    'hydration.mjs',
    ...readdirSync(new URL('hydration/', folder))
      .filter((file) => file.endsWith('.mjs'))
      .sort()
      .map((file) => `hydration/${file}`),
  ]
  const solver = sources.map((file) => readFileSync(new URL(file, folder), 'utf8')).join('\n')
  const codes = [...new Set([...solver.matchAll(/code: '(\w+)'/g)].map((m) => m[1]))]

  it('every code the solver writes has a catalog entry and leaves a build passing', async () => {
    expect(codes).toEqual(expect.arrayContaining(['H010', 'H017']))
    for (const code of codes) expect([code, entry(code)?.severity]).toEqual([code, 'info'])
    const root = project({})
    mkdirSync(join(root, '.kerf'))
    writeFileSync(
      join(root, '.kerf/hydration.json'),
      JSON.stringify({
        diagnostics: codes.map((code) => ({
          code,
          file: 'src/App.tsx',
          line: 1,
          why: 'why',
          fix: 'fix',
        })),
      }),
    )
    const r = await check(root)
    expect(
      r.diagnostics.filter((d) => codes.includes(d.code)).map((d) => [d.code, d.severity]),
    ).toEqual(codes.map((c) => [c, 'info']))
    expect(r.ok).toBe(true)
  })
})

describe('U001–U005: interaction() and ui', () => {
  const page = (body: string) =>
    `import { interaction } from '@kerf-js/core/interaction'\nimport { Button, Tabs } from '@kerf-js/veneer'\nexport function A() {\n${body}\n}\n`
  const codes = async (files: Record<string, string>) =>
    (await check(project(files))).diagnostics.map((d) => d.code).filter((c) => c.startsWith('U'))

  it('a key that can never match', async () => {
    expect(
      await codes({
        'src/A.tsx': page(
          `const row = interaction({ share: \`r:\${Math.random()}\` }); return <Button ui={row}>x</Button>`,
        ),
      }),
    ).toEqual(['U001'])
  })
  it('a key the user chose', async () => {
    expect(
      await codes({
        'src/A.tsx': page(
          'const row = interaction({ share: location.pathname + "x" }); return <Button ui={row}>x</Button>',
        ),
      }),
    ).toEqual(['U002'])
  })
  it('share with no rule, in a full-stack app only', async () => {
    const body = {
      'src/A.tsx': page(
        "const row = interaction({ share: 'a' }); return <Button ui={row}>x</Button>",
      ),
    }
    expect(await codes(body)).toEqual([])
    expect(
      await codes({ ...body, 'src/routes/index.tsx': 'export default () => <p>x</p>\n' }),
    ).toEqual(['U003'])
    expect(
      await codes({
        ...body,
        'src/routes/index.tsx': 'export default () => <p>x</p>\n',
        'src/realtime.server.ts': 'export default { share: () => true }\n',
      }),
    ).toEqual([])
  })
  it('writing remote', async () => {
    expect(
      await codes({
        'src/A.tsx': page(
          'const row = interaction(); const go = () => { row.remote.value = {} }; return <Button ui={row} onClick={go}>x</Button>',
        ),
      }),
    ).toEqual(['U004'])
  })
  it('ui on a component that does not take it', async () => {
    expect(
      await codes({ 'src/A.tsx': page('const row = interaction(); return <Tabs ui={row} />') }),
    ).toEqual(['U005'])
  })
  it('a correct row is quiet', async () => {
    expect(
      await codes({
        'src/A.tsx': page(
          "const row = interaction({ share: 'fixed' }); return <Button ui={row}>{row.hover.value ? 'y' : 'n'}</Button>",
        ),
      }),
    ).toEqual([])
  })
})

function registerProjectAliasTests() {
  const compilerOptions = {
    target: 'es2022',
    module: 'esnext',
    moduleResolution: 'bundler',
    strict: true,
    noEmit: true,
    skipLibCheck: true,
    jsx: 'preserve',
    jsxImportSource: '@kerf-js/core',
    lib: ['es2023', 'dom', 'dom.iterable'],
    types: [],
  }

  it('follows the #/ alias like a relative import', async () => {
    const aliased = spreadBug(app).replaceAll("from './components/", "from '#/components/")
    expect(aliased).toContain('#/components/ProductList')
    const r = await check(
      project({
        'src/App.tsx': aliased,
        'tsconfig.json': JSON.stringify({
          compilerOptions: { ...compilerOptions, paths: { '#/*': ['./src/*'] } },
        }),
      }),
    )
    expect(r.diagnostics.map((d) => [d.code, d.severity, d.project])).toEqual([
      ['W014', 'error', true],
    ])
  })

  it('follows whatever alias the app declares', async () => {
    const aliased = spreadBug(app).replaceAll("from './components/", "from '@/ui/")
    const tsconfig = `// the app's own\n${JSON.stringify({
      compilerOptions: { ...compilerOptions, paths: { '@/ui/*': ['./src/components/*'] } },
    })}\n`
    const r = await check(project({ 'src/App.tsx': aliased, 'tsconfig.json': tsconfig }))
    expect(r.diagnostics.map((d) => [d.code, d.severity, d.project])).toEqual([
      ['W014', 'error', true],
    ])
  })

  it('promotes the spread habit to an error when the box reaches a keyed list in another file', async () => {
    const dir = project({ 'src/App.tsx': spreadBug(app) })
    const r = await check(dir)
    expect(r.ok).toBe(false)
    const [d] = r.diagnostics
    expect(r.diagnostics).toHaveLength(1)
    expect(d).toMatchObject({
      code: 'W014',
      severity: 'error',
      project: true,
      file: 'src/App.tsx',
      docs: 'kerf docs W014',
    })
    const text = readFileSync(join(dir, 'src/App.tsx'), 'utf8')
    expect(text.slice(...d.offset)).toMatch(/^products\.value\.map\(\(p\) => \(\{ \.\.\.p/)
    expect(d.span.slice(0, 2)).toEqual([26, 28])
    expect(d.why).toContain('src/components/ProductList.tsx:71')
    expect(
      d.related.map((x: { file: string; span: number[]; why: string }) => [
        x.file,
        x.span[0],
        x.why,
      ]),
    ).toEqual([
      ['src/App.tsx', 54, 'passed as `<ProductList products>`'],
      ['src/components/ProductList.tsx', 71, 'rendered here as a keyed list'],
    ])
    expect(d.fix.text).toContain('p.id === id ? { ...p, price } : p')
  })
}

function registerProjectFlowTests() {
  it('keeps the warning when the box goes to a component that never lists it', async () => {
    const dir = project({
      'src/App.tsx': `import { state } from '@kerf-js/core'
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
    expect(r.diagnostics.map((d) => [d.code, d.severity, d.project ?? false])).toEqual([
      ['W014', 'warning', false],
    ])
  })

  it('follows props through derived and a second component', async () => {
    const dir = project({
      'src/App.tsx': `import { state } from '@kerf-js/core'
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
      'src/Table.tsx': `import { derived } from '@kerf-js/core'
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
}

function registerDiagnosticPositionTests() {
  it('converts byte offsets to UTF-16 lines and columns, with edits for autofixes', async () => {
    const dir = project({
      'src/Badge.tsx': `import { state } from '@kerf-js/core'\n// é ü 🎉\nexport function Badge() {\n  const n = state(0)\n  return <p title="é🎉">{n}</p>\n}\n`,
    })
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

  it('reports P002 for package.json scripts that are not kerf aliases', async () => {
    const dir = project({
      'package.json': JSON.stringify(
        { scripts: { dev: 'kerf dev', seed: 'node seed.mjs' } },
        null,
        2,
      ),
    })
    const r = await check(dir)
    expect(r.diagnostics.map((d) => [d.code, d.file, d.span[0]])).toEqual([
      ['P002', 'package.json', 4],
    ])
    expect(r.ok).toBe(true)
  })

  it("reports R004 for a socket handler of the app's own", async () => {
    const dir = project({
      'src/server/ws.ts':
        "import { defineWebSocketHandler } from 'nitro'\nexport default defineWebSocketHandler({})\n",
    })
    const r = await check(dir)
    expect(r.diagnostics.map((d) => [d.code, d.file])).toEqual([['R004', 'src/server/ws.ts']])
  })

  it('reports R007 for a socket library in dependencies, and nothing for one in devDependencies', async () => {
    const dir = project({
      'package.json': JSON.stringify(
        { dependencies: { ws: '8.0.0' }, devDependencies: { 'socket.io-client': '4.0.0' } },
        null,
        2,
      ),
    })
    const r = await check(dir)
    expect(r.diagnostics.map((d) => [d.code, d.file])).toEqual([['R007', 'package.json']])
    expect(r.diagnostics[0].severity).toBe('warning')
  })
}

function registerDiagnosticScopeTests() {
  it('reports P120 for a kerf plugin wired straight into vite.config.ts', async () => {
    const dir = project({
      'vite.config.ts':
        "import { text } from '@kerf-js/text'\nexport default { plugins: [text().vite] }\n",
    })
    const r = await check(dir)
    expect(r.diagnostics.map((d) => [d.code, d.file, d.span])).toEqual([
      ['P120', 'vite.config.ts', [1, 23, 1, 36]],
    ])
  })

  it('never compiles files under scope.forbid', async () => {
    const dir = project({
      'kerf.config.ts':
        "import { defineConfig } from '@kerf-js/core/config'\nexport default defineConfig({ scope: { forbid: ['src/components/**'] } })\n",
    })
    const r = await check(dir)
    expect(r.files).toEqual(['src/App.tsx', 'src/main.tsx'])
  })

  it('reports the @kerf-js/core/browser codes with their edits (W050, W051, W054)', async () => {
    const clock = `import { state } from '@kerf-js/core'
import { media, online } from '@kerf-js/core/browser'
export const up = online()
export function Clock() {
  const now = state(0)
  const dark = media('(prefers-color-scheme: dark)')
  setInterval(() => { now.value++ }, 1000)
  return <p>{now.value} {dark.value ? 'dark' : 'light'}</p>
}
`
    const dir = project({ 'src/Clock.tsx': clock })
    const r = await check(dir)
    expect(r.diagnostics.map((d) => [d.code, d.severity, d.span[0]])).toEqual([
      ['W051', 'error', 3],
      ['W054', 'warning', 6],
      ['W050', 'error', 7],
    ])
    const apply = (d: { fix: { edits: { offset: [number, number]; text: string }[] } }) =>
      d.fix.edits
        .toSorted((a, b) => b.offset[0] - a.offset[0])
        .reduce((t, e) => t.slice(0, e.offset[0]) + e.text + t.slice(e.offset[1]), clock)
    const [w051, w054, w050] = r.diagnostics
    expect(w051.fix.edits).toBeUndefined()
    expect(apply(w054)).toContain("media('(prefers-color-scheme: dark)', { ssr: false })")
    const fixed = apply(w050)
    expect(fixed).toContain("import { media, online, interval } from '@kerf-js/core/browser'")
    expect(fixed).toContain('interval(1000, () => { now.value++ })')
    expect(w050.docs).toBe('kerf docs W050')
  })
}
