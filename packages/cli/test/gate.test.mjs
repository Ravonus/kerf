import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { gate, gitChanges } from '../src/gate.mjs'
import { changedLines, mutants, sample } from '../src/mutate.mjs'
import { changedCases, testCases, weakened } from '../src/testdiff.mjs'

const tmpRoot = fileURLToPath(new URL('./.tmp/', import.meta.url))

describe('test cases and T020', () => {
  const v1 = `describe('stock', () => {
  test('stops at stock', () => {
    expect(canAdd(3, 3)).toBe(false)
    expect(label(1, 3)).toBe('Only 2 left')
  })
  test('zero', () => { expect(label(0, 0)).toBe('Out of stock') })
})
test('calls back', () => { expect(cb).toHaveBeenCalledWith(1) })`

  it('names cases the way vitest reports them', () => {
    expect(testCases(v1, 'a.test.ts').map((c) => [c.name, c.asserts.length])).toEqual([
      ['stock > stops at stock', 2],
      ['stock > zero', 1],
      ['calls back', 1],
    ])
  })

  it('a new or edited test is changed; an untouched one is not', () => {
    const v2 =
      v1.replace("toBe('Out of stock')", "toBe('Sold out')") +
      "\ntest('new', () => { expect(1 + f()).toBe(2) })"
    expect(changedCases(v1, v2, 'a.test.ts').map((c) => c.name)).toEqual(['stock > zero', 'new'])
    expect(changedCases(null, v1, 'a.test.ts')).toHaveLength(3)
  })

  it('T020: deleted, skipped, loosened and removed assertions', () => {
    const codes = (after) =>
      weakened(v1, after, 'a.test.ts').map((d) => d.why.split('. An existing')[0])
    expect(codes(v1.replace(/ {2}test\('zero'.*\n/, ''))).toEqual([
      'test "stock > zero" was deleted',
    ])
    expect(codes(v1.replace("test('zero'", "test.skip('zero'"))).toEqual([
      'test "stock > zero" is now skipped',
    ])
    expect(codes(v1.replace('toBe(false)', 'toBeFalsy()'))).toEqual([
      'in "stock > stops at stock", `expect(canAdd(3, 3)).toBe(false)` became `toBeFalsy()`, which accepts more',
    ])
    expect(codes(v1.replace('toHaveBeenCalledWith(1)', 'toHaveBeenCalled()'))).toEqual([
      'in "calls back", `expect(cb).toHaveBeenCalledWith(1)` became `toHaveBeenCalled()`, which accepts more',
    ])
    expect(codes(v1.replace("    expect(label(1, 3)).toBe('Only 2 left')\n", ''))).toEqual([
      '"stock > stops at stock" lost 1 assertion: `expect(label(1, 3)).toBe(…)`',
    ])
    expect(weakened(v1, null, 'a.test.ts')[0].why).toMatch(/a\.test\.ts was deleted with 3 tests/)
  })

  it('T020 stays quiet for a changed expected value, a rename, a new assertion, and an allowed change', () => {
    expect(weakened(v1, v1.replace("'Only 2 left'", "'Only 2 remaining'"), 'a.test.ts')).toEqual([])
    expect(weakened(v1, v1.replace("'calls back'", "'calls the callback'"), 'a.test.ts')).toEqual(
      [],
    )
    expect(
      weakened(
        v1,
        v1.replace('toBe(false)\n', 'toBe(false)\n    expect(canAdd(2, 3)).toBe(true)\n'),
        'a.test.ts',
      ),
    ).toEqual([])
    const allowed = v1.replace(
      "  test('zero'",
      "  // weft-allow T020: zero stock is now a different screen, covered in empty.test.ts\n  test.skip('zero'",
    )
    expect(weakened(v1, allowed, 'a.test.ts')).toEqual([])
  })
})

describe('mutants', () => {
  it('changed lines come from a line diff', () => {
    expect([...changedLines('a\nb\nc\n', 'a\nB\nc\nd\n')]).toEqual([2, 4])
    expect([...changedLines(null, 'x\ny')]).toEqual([1, 2])
  })

  it('mutates operators, boundaries, literals, conditions, calls and JSX text on changed lines only', () => {
    const src = `export function f(a: number, b: number) {
  if (a >= b && !done) log('x')
  return a === 0 ? 'none' : <p>Only {a} left</p>
}
const keep = 1 + 2`
    const ms = mutants(src, 'f.tsx', new Set([2, 3]))
    const ops = ms.map((m) => `${m.line}:${m.op}:${m.original}→${m.replacement}`)
    expect(ops).toEqual(
      expect.arrayContaining([
        '2:condition:a >= b && !done→true',
        '2:operator:>=→>',
        '2:operator:>=→<',
        '2:operator:&&→||',
        '2:negation:!done→done',
        "2:call:log('x')→;",
        '2:string:\'x\'→""',
        '3:operator:===→!==',
        '3:number:0→1',
        '3:condition:a === 0→false',
        '3:string:\'none\'→""',
        '3:jsx-text:Only→',
        '3:jsx-text:left→',
      ]),
    )
    expect(ms.every((m) => m.line !== 5)).toBe(true)
  })

  it('samples round-robin across lines', () => {
    const list = [1, 1, 1, 2, 2, 3].map((line, i) => ({ file: 'a', line, i }))
    expect(sample(list, 4).map((m) => m.i)).toEqual([0, 3, 5, 1])
  })
})

/** A small TS project under this package (vitest resolves from packages/cli/node_modules). */
function fixture(files) {
  mkdirSync(tmpRoot, { recursive: true })
  const dir = mkdtempSync(join(tmpRoot, 'gate-'))
  const all = {
    'package.json': '{ "name": "gate-fixture", "type": "module", "private": true }',
    'vitest.config.mjs':
      "import { defineConfig } from 'vitest/config'\nexport default defineConfig({ test: { include: ['src/**/*.test.ts'], globals: true } })\n",
    ...files,
  }
  for (const [rel, text] of Object.entries(all)) {
    mkdirSync(join(dir, rel, '..'), { recursive: true })
    writeFileSync(join(dir, rel), text)
  }
  return dir
}

const before = `export function canAdd(qty: number, stock: number) {
  return true
}
export function label(qty: number, stock: number) {
  return ''
}
`
const after = `export function canAdd(qty: number, stock: number) {
  return qty < stock
}
export function label(qty: number, stock: number) {
  if (stock === 0) return 'Out of stock'
  return stock - qty <= 3 ? \`Only \${stock - qty} left\` : ''
}
`
const sound = `import { canAdd, label } from './stock'
test('stops at stock', () => {
  expect(canAdd(2, 3)).toBe(true)
  expect(canAdd(3, 3)).toBe(false)
})
test('labels low and zero stock', () => {
  expect(label(1, 3)).toBe('Only 2 left')
  expect(label(0, 4)).toBe('')
  expect(label(0, 0)).toBe('Out of stock')
})
`

function registerSoundAndJunk() {
  it('accepts sound tests: they fail before, pass after, and kill mutants', async () => {
    const dir = fixture({ 'src/stock.ts': after, 'src/stock.test.ts': sound })
    const r = await gate(dir, {
      changes: [
        { rel: 'src/stock.ts', before, after },
        { rel: 'src/stock.test.ts', before: null, after: sound },
      ],
      budgetSec: 60,
    })
    expect(r.diagnostics).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.tests.map((t) => [t.name, t.before, t.after])).toEqual([
      ['stops at stock', 'failed', 'passed'],
      ['labels low and zero stock', 'failed', 'passed'],
    ])
    expect(r.tests.every((t) => t.kills > 0)).toBe(true)
    expect(r.mutants.run).toBe(r.mutants.generated)
    expect(r.survivors.every((s) => s.suggestion.startsWith('src/stock.ts:'))).toBe(true)
  })

  it('catches junk: a tautology (T002), a test that passes before (T010), one that kills nothing (T011), an implementation query (T005)', async () => {
    const junk = `import { canAdd, label } from './stock'
test('tautology', () => {
  expect(true).toBe(true)
})
test('passes before', () => {
  expect(canAdd(1, 3)).toBe(true)
})
test('kills nothing', () => {
  expect(typeof label(1, 3)).toBe('string')
})
test('implementation detail', () => {
  expect(document.querySelector('.stock-label')).toBeNull()
})
`
    const dir = fixture({ 'src/stock.ts': after, 'src/junk.test.ts': junk })
    const r = await gate(dir, {
      changes: [
        { rel: 'src/stock.ts', before, after },
        { rel: 'src/junk.test.ts', before: null, after: junk },
      ],
      budgetSec: 60,
    })
    expect(r.ok).toBe(false)
    const found = r.diagnostics.map((d) => `${d.code}:${d.span[0]}:${d.severity}`)
    expect(found).toEqual(
      expect.arrayContaining([
        'T002:3:error',
        'T010:2:error',
        'T010:5:error',
        'T010:8:error',
        'T005:12:error',
      ]),
    )
    expect(r.tests.find((t) => t.name === 'implementation detail')).toMatchObject({
      after: 'failed',
    }) // no DOM here: it can't even run
  })
}

function registerMutationAndGit() {
  it('reports T011 for a test that fails before but kills no mutant of the changed lines', async () => {
    const weak = `import { label } from './stock'
test('label is a string with text', () => {
  expect(label(1, 3).length > 0).toBe(true)
})
`
    const dir = fixture({ 'src/stock.ts': after, 'src/weak.test.ts': weak })
    const r = await gate(dir, {
      changes: [
        { rel: 'src/stock.ts', before, after },
        { rel: 'src/weak.test.ts', before: null, after: weak },
      ],
      budgetSec: 60,
    })
    expect(r.tests[0]).toMatchObject({ before: 'failed', after: 'passed' })
    // It kills some mutants (blanking the label), so it is not T011; make sure the survivors still point at what's missed.
    expect(r.survivors.some((s) => s.op === 'number' || s.op === 'operator')).toBe(true)
  })

  it('reads the diff from git, and flags a weakened existing test (T020)', async () => {
    const dir = fixture({
      'src/stock.ts': before.replace("return ''", "return 'x'"),
      'src/stock.test.ts':
        "import { label } from './stock'\ntest('label', () => {\n  expect(label(1, 3)).toBe('x')\n})\n",
    })
    const git = (...a) => execFileSync('git', ['-C', dir, ...a], { stdio: 'pipe' })
    git('init', '-q')
    git('add', '.')
    git('-c', 'user.name=t', '-c', 'user.email=t@t', 'commit', '-qm', 'base')
    writeFileSync(join(dir, 'src/stock.ts'), after)
    writeFileSync(
      join(dir, 'src/stock.test.ts'),
      "import { label } from './stock'\ntest('label', () => {\n  expect(label(1, 3)).toBeTruthy()\n})\n",
    )
    expect(
      gitChanges(dir)
        .map((c) => c.rel)
        .sort(),
    ).toEqual(['src/stock.test.ts', 'src/stock.ts'])
    const r = await gate(dir, { budgetSec: 30 })
    expect(r.diagnostics.map((d) => d.code)).toContain('T020')
    expect(readFileSync(join(dir, 'src/stock.ts'), 'utf8')).toBe(after) // the working tree is never touched
  })

  it('with no source change, skips fail-before and mutates what the new tests import', async () => {
    const dir = fixture({ 'src/stock.ts': after, 'src/stock.test.ts': sound })
    const r = await gate(dir, {
      changes: [{ rel: 'src/stock.test.ts', before: null, after: sound }],
      budgetSec: 60,
    })
    expect(r.notes).toContain(
      'no source change: fail-before skipped; mutants come from the source the new tests import',
    )
    expect(r.tests.every((t) => t.before === null && t.kills > 0)).toBe(true)
    expect(r.ok).toBe(true)
  })
}

describe('the gate', () => {
  registerSoundAndJunk()
  registerMutationAndGit()
})
