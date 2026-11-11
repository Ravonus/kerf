import { repoRoot } from '../../../scripts/lib/helpers.mjs'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { catalog } from '../src/catalog.mjs'
import { check } from '../src/check.mjs'
import { discover } from '../src/files.mjs'
import { checkTestFile, checkTests, probeTests } from '../src/tests.mjs'
import { project } from './helpers.mjs'

const repo = repoRoot
const codes = (src: string, file = 'x.test.tsx') => checkTestFile(src, file).map((d) => d.code)
const apply = (src: string, fix: { edits: { offset: [number, number]; text: string }[] }) =>
  [...fix.edits]
    .sort((a, b) => b.offset[0] - a.offset[0])
    .reduce((s, e) => s.slice(0, e.offset[0]) + e.text + s.slice(e.offset[1]), src)

describe('T-codes: each fires on junk', () => {
  registerCatalogExamples()

  it('T001: no assertion, or expect without a matcher', () => {
    expect(codes(`test('renders', () => { render(App) })`)).toEqual(['T001'])
    expect(codes(`it('x', async () => { await user.click(button) })`)).toEqual(['T001'])
    const [d] = checkTestFile(
      `test('a', () => { expect(1 + 1).toBe(2); expect(total()) })`,
      'x.test.ts',
    )
    expect(d).toMatchObject({ code: 'T001', severity: 'error', docs: 'kerf docs T001' })
    expect(d.why).toContain('`expect(total())` has no matcher')
  })

  it('T001 stays quiet for assertions in local helpers, expect.assertions and assert', () => {
    const src = `function expectTotal(t: string) { expect(total()).toBe(t) }
const check = (n: number) => { expectTotal(String(n)) }
test('a', () => { check(1) })
test('b', () => { expect.assertions(1) })
test('c', () => { assert.equal(f(), 1) })
test.todo('later')`
    expect(codes(src)).toEqual([])
  })

  registerLiteralAssertions()

  registerSelfSetValueAssertions()

  registerTimerDiagnostics()

  it('T004: a zero-delay sleep gets a flush() edit that imports it', () => {
    const src = `import { render } from '@kerf/core/test'\ntest('a', async () => { await new Promise(r => setTimeout(r)); expect(f()).toBe(1) })`
    const [d] = checkTestFile(src, 'x.test.tsx')
    expect(d.code).toBe('T004')
    expect(d.fix.safe).toBe(false)
    expect(apply(src, d.fix)).toBe(
      `import { render, flush } from '@kerf/core/test'\ntest('a', async () => { await flush(); expect(f()).toBe(1) })`,
    )
    const bare = `test('a', async () => { await new Promise(r => setTimeout(r)); expect(f()).toBe(1) })`
    expect(apply(bare, checkTestFile(bare, 'x.test.ts')[0].fix)).toBe(
      `import { flush } from '@kerf/core/test'\ntest('a', async () => { await flush(); expect(f()).toBe(1) })`,
    )
  })

  registerTestImplementationSelectors()

  registerMockDiagnostics()

  registerSnapshotDiagnostics()

  registerConditionalAssertions()

  registerOnlyAndSkipDiagnostics()

  it('kerf-allow in the file header covers the whole file; without a reason it is ignored', () => {
    const body = `test('a', () => { expect(document.querySelector('p')!.textContent).toBe('x') })`
    expect(
      codes(`// kerf-allow T005: framework test of compiled DOM\nimport { x } from 'y'\n${body}`),
    ).toEqual([])
    expect(codes(`// kerf-allow T005\nimport { x } from 'y'\n${body}`)).toEqual(['T005'])
    expect(
      codes(`import { x } from 'y'\n// kerf-allow T005: only this line\nconst a = 1\n${body}`),
    ).toEqual(['T005'])
  })
})

describe('T-codes stay quiet on the repo’s own tests', () => {
  for (const dir of ['packages/core/test', 'evals/tasks-v3/shop/hidden']) {
    it(dir, () => {
      const root = join(repo, dir)
      const rels = discover(root, { include: ['**/*.test.{ts,tsx}'] })
      expect(rels.length).toBeGreaterThan(4)
      expect(checkTests(root, rels).map((d) => `${d.file}:${d.span[0]} ${d.code}`)).toEqual([])
    })
  }
})

describe('kerf check reports T-codes', () => {
  it('lints test files next to the components, and the reference stays clean', async () => {
    const dir = project({
      'src/Header.test.tsx': `import { render } from '@kerf/core/test'
import { Header } from './components/Header'
test.only('header', () => { render(Header, { count: 1 } as any) })
`,
    })
    const r = await check(dir)
    expect(r.tests).toEqual(['src/Header.test.tsx'])
    expect(r.summary.tests).toBe(1)
    expect(
      r.diagnostics.filter((d) => d.file.endsWith('.test.tsx')).map((d) => [d.code, d.span[0]]),
    ).toEqual([
      ['T001', 3],
      ['T009', 3],
    ])
    const text = readFileSync(join(dir, 'src/Header.test.tsx'), 'utf8')
    const t9 = r.diagnostics.find((d) => d.code === 'T009')
    expect(text.slice(...t9.fix.edits[0].offset)).toBe('.only')
  })

  it('takes test files from --files too', async () => {
    const dir = project({ 'src/a.test.ts': `test('a', () => { expect(true).toBe(true) })\n` })
    const r = await check(dir, { files: ['src/a.test.ts'] })
    expect(r.files).toEqual([])
    expect(r.diagnostics.map((d) => d.code)).toEqual(['T002'])
  })
})

function registerTestImplementationSelectors() {
  it('T005: container, selectors, classes, test ids, app state', () => {
    expect(
      codes(
        `test('a', () => { const { container } = render(App); expect(container.textContent).toBe('x') })`,
      ),
    ).toEqual(['T005'])
    expect(
      codes(
        `test('a', () => { render(App); expect(document.querySelector('.total')!.textContent).toBe('$1') })`,
      ),
    ).toEqual(['T005'])
    expect(
      codes(`test('a', () => { expect(screen.getByTestId('total').textContent).toBe('$1') })`),
    ).toEqual(['T005'])
    expect(
      codes(`test('a', () => { expect(screen.getByRole('button').className).toBe('primary') })`),
    ).toEqual(['T005'])
    const appState = `import { cart } from './cart'\ntest('a', () => { render(App); expect(cart.items.value).toEqual([]) })`
    const dir = project({
      'src/cart.ts': 'export const cart = { items: { value: [] } }\n',
      'src/a.test.tsx': appState,
      'src/b.test.ts': appState.replace('render(App); ', ''),
    })
    expect(
      checkTests(dir, ['src/a.test.tsx', 'src/b.test.ts']).map((x) => [x.file, x.code]),
    ).toEqual([['src/a.test.tsx', 'T005']]) // a unit test of state may read it
    expect(
      checkTestFile(
        `test('a', () => { render(App); expect(screen.getByRole('button').textContent).toBe('Add') })`,
        'x.test.tsx',
      ),
    ).toEqual([])
    expect(
      checkTestFile(
        `test('a', () => { expect(screen.getByTestId('t').textContent).toBe('1') })`,
        'x.test.tsx',
      )[0].severity,
    ).toBe('warning')
  })
}

function registerTimerDiagnostics() {
  it('T004: sleeps, real timers and waitFor', () => {
    expect(
      codes(
        `test('a', async () => { await new Promise(r => setTimeout(r, 100)); expect(f()).toBe(1) })`,
      ),
    ).toEqual(['T004'])
    expect(codes(`test('a', async () => { await sleep(50); expect(f()).toBe(1) })`)).toEqual([
      'T004',
    ])
    expect(codes(`test('a', async () => { await waitFor(() => expect(f()).toBe(1)) })`)).toEqual([
      'T004',
    ])
    expect(codes(`test('a', () => { setTimeout(tick, 10); expect(f()).toBe(1) })`)).toEqual([
      'T004',
    ])
    // Fake timers, and a fake API's latency that resolves with data, are fine.
    expect(
      codes(
        `beforeEach(() => vi.useFakeTimers())\ntest('a', () => { setTimeout(tick, 10); expect(f()).toBe(1) })`,
      ),
    ).toEqual([])
    expect(
      codes(
        `const load = (id: string) => new Promise(ok => setTimeout(() => ok({ id }), 50))\ntest('a', () => { expect(load).toBeTypeOf('function') })`,
      ),
    ).toEqual([])
  })
}

function registerSelfSetValueAssertions() {
  it('T003: asserting a value the test just set', () => {
    expect(
      codes(`test('a', () => { const n = state(0); n.value = 5; expect(n.value).toBe(5) })`),
    ).toEqual(['T003'])
    expect(
      codes(
        `test('a', async () => { const n = state(3); await flush(); expect(n.value).toBe(3) })`,
      ),
    ).toEqual(['T003'])
    expect(codes(`test('a', () => { let x = 1; x = 2; expect(x).toBe(2) })`)).toEqual(['T003'])
    // Something in between may have gone through the UI or the graph.
    expect(
      codes(
        `test('a', async () => { const n = state(0); n.value = 5; await user.click(reset); expect(n.value).toBe(5) })`,
      ),
    ).toEqual([])
    expect(
      codes(`test('a', () => { const n = state(0); n.value = 500; expect(n.value).toBe(100) })`),
    ).toEqual([])
    // A linked box has its own write semantics, so a write that sticks is behavior.
    expect(
      codes(
        `test('a', () => { const l = state.linked(() => p.value); l.value = 'e'; expect(l.value).toBe('e') })`,
      ),
    ).toEqual([])
  })
}

function registerMockDiagnostics() {
  it('T006: mocking kerf or the unit under test', () => {
    expect(codes(`vi.mock('@kerf/core')\ntest('a', () => { expect(f()).toBe(1) })`)).toEqual([
      'T006',
    ])
    expect(
      codes(`vi.mock('@kerf/core/dom', () => ({}))\ntest('a', () => { expect(f()).toBe(1) })`),
    ).toEqual(['T006'])
    expect(
      codes(
        `import { Cart } from './Cart'\nvi.mock('./Cart')\ntest('a', () => { render(Cart); expect(screen.getByRole('list')).toBeTruthy() })`,
      ),
    ).toEqual(['T006'])
    expect(
      codes(
        `import * as kerf from '@kerf/core'\ntest('a', () => { vi.spyOn(kerf, 'state'); expect(f()).toBe(1) })`,
      ),
    ).toEqual(['T006'])
    // Faking an edge is fine.
    expect(
      codes(
        `import { Cart } from './Cart'\nvi.mock('./api')\ntest('a', () => { render(Cart); expect(screen.getByRole('list')).toBeTruthy() })`,
      ),
    ).toEqual([])
  })
}

function registerOnlyAndSkipDiagnostics() {
  it('T009: .only and .skip, with edits', () => {
    const only = `describe('cart', () => { test.only('a', () => { expect(f()).toBe(1) }) })`
    const [d] = checkTestFile(only, 'x.test.ts')
    expect(d).toMatchObject({ code: 'T009', fix: { safe: true } })
    expect(apply(only, d.fix)).toBe(
      `describe('cart', () => { test('a', () => { expect(f()).toBe(1) }) })`,
    )
    const skip = `describe.skip('cart', () => { it('a', () => { expect(f()).toBe(1) }) })`
    const [s] = checkTestFile(skip, 'x.test.ts')
    expect(s).toMatchObject({ code: 'T009', fix: { safe: false } })
    expect(apply(skip, s.fix)).toBe(
      `describe('cart', () => { it('a', () => { expect(f()).toBe(1) }) })`,
    )
    const fit = `fit('a', () => { expect(f()).toBe(1) })`
    expect(apply(fit, checkTestFile(fit, 'x.test.ts')[0].fix)).toBe(
      `it('a', () => { expect(f()).toBe(1) })`,
    )
    expect(codes(`test.only.each([1, 2])('n %i', n => { expect(f(n)).toBe(n) })`)).toEqual(['T009'])
    expect(codes(`test.skip('a', () => {})`)).toEqual(['T009']) // skipped: no T001 on top
    expect(
      codes(`test.skipIf(process.platform === 'win32')('a', () => { expect(f()).toBe(1) })`),
    ).toEqual([])
  })
}

function registerConditionalAssertions() {
  it('T008: conditional expect, and tests whose only expects are looped', () => {
    expect(codes(`test('a', () => { if (rows().length) expect(rows()[0]).toBe('x') })`)).toEqual([
      'T008',
    ])
    expect(
      codes(`test('a', () => { try { f() } catch (e) { expect(e).toBeInstanceOf(Error) } })`),
    ).toEqual(['T008'])
    expect(codes(`test('a', () => { ok && expect(f()).toBe(1) })`)).toEqual(['T008'])
    expect(codes(`test('a', () => { for (const r of rows()) expect(r).toBeTruthy() })`)).toEqual([
      'T008',
    ])
    expect(codes(`test('a', () => { rows().forEach(r => expect(r).toBeTruthy()) })`)).toEqual([
      'T008',
    ])
    expect(
      codes(
        `test('a', () => { expect(rows()).toHaveLength(3); for (const r of rows()) expect(r).toBeTruthy() })`,
      ),
    ).toEqual([])
  })
}

function registerCatalogExamples() {
  it('every catalog example reports its own code', () => {
    const status = probeTests(catalog) as Record<string, { implemented: boolean; autofix: boolean }>
    expect(Object.keys(status)).toEqual([
      'T001',
      'T002',
      'T003',
      'T004',
      'T005',
      'T006',
      'T007',
      'T008',
      'T009',
      'T013',
    ])
    for (const [code, s] of Object.entries(status)) expect(s.implemented, code).toBe(true)
    expect(status.T009!.autofix).toBe(true)
  })
}

function registerSnapshotDiagnostics() {
  it('T007: snapshots, unless approved with a reason', () => {
    expect(codes(`test('a', () => { expect(html()).toMatchSnapshot() })`)).toEqual(['T007'])
    expect(codes(`test('a', () => { expect(html()).toMatchInlineSnapshot('"<p>"') })`)).toEqual([
      'T007',
    ])
    expect(
      codes(
        `test('a', () => {\n  // kerf-allow T007: the exported SVG is the product\n  expect(svg()).toMatchSnapshot()\n})`,
      ),
    ).toEqual([])
    expect(
      codes(`test('a', () => {\n  // kerf-allow T007\n  expect(svg()).toMatchSnapshot()\n})`),
    ).toEqual(['T007'])
  })
}

function registerLiteralAssertions() {
  it('T002: literals and self-comparison', () => {
    expect(codes(`test('a', () => { expect(true).toBe(true) })`)).toEqual(['T002'])
    expect(codes(`test('a', () => { expect([1, { a: 'b' }]).toEqual([1, { a: 'b' }]) })`)).toEqual([
      'T002',
    ])
    expect(codes(`test('a', () => { const x = f(); expect(x).toBe(x) })`)).toEqual(['T002'])
    expect(codes(`test('a', () => { const x = f(); expect(x === x).toBe(true) })`)).toEqual([
      'T002',
    ])
    expect(
      codes(`test('a', () => { expect(rows()).toEqual(rows()); expect(x).not.toBe(x) })`),
    ).toEqual([])
  })
}
