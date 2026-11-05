import { test } from 'node:test'
import { deepStrictEqual, ok } from 'node:assert/strict'
import { gaps, compare } from './diagnostic-catalog.mjs'

const catalog = [{ code: 'W001', by: 'compiler' }]
const source = { 'source.rs': 'Diagnostic::new(source, "W001", severity, span);' }
const tests = { 'compile.rs': 'assert_eq!(codes(&d), ["W001"]);' }
const run = (c = catalog, s = source, t = tests, baseline = []) => compare(gaps(c, s, t), baseline)

test('valid inputs and repaired gaps pass', () => {
  deepStrictEqual(run(), [])
  for (const [bad, expected] of [
    [run([], source, tests), 'missing entry: W001'],
    [run(catalog, {}, tests), 'missing emit: W001'],
    [run(catalog, source, {}), 'missing test: W001'],
  ]) {
    ok(bad.includes(expected))
    deepStrictEqual(run(), [])
  }
})

test('baseline admits current gaps but rejects stale entries', () => {
  const baseline = ['missing test: W001']
  deepStrictEqual(run(catalog, source, {}, baseline), [])
  deepStrictEqual(run(catalog, source, tests, baseline), ['stale baseline: missing test: W001'])
  deepStrictEqual(run(), [])
})

test('unknown dynamic constructor fails', () => {
  const problems = run(catalog, { 'source.rs': 'Diagnostic::new(source, code, severity);' }, tests)
  ok(problems.some((problem) => problem.includes('unrecognized constructor')))
  deepStrictEqual(run(), [])
})

const mappedCatalog = [{ code: 'W008', by: 'cli' }]
const cli = {
  source: { 'packages/cli/src/box.cjs': "function emit() { return { code: 'W008' } }" },
  tests: { 'packages/cli/test/box.test.ts': "expect(result.code).toBe('W008')" },
}
const mapped = (c = mappedCatalog, s = cli.source, t = cli.tests) =>
  compare(gaps(c, {}, {}, { source: s, tests: t }), [])

test('mapped CLI rules require both real emit and assertion sites', () => {
  deepStrictEqual(mapped(), [])
  deepStrictEqual(mapped(mappedCatalog, {}), ['missing emit: W008'])
  deepStrictEqual(mapped(mappedCatalog, cli.source, {}), ['missing test: W008'])
  deepStrictEqual(mapped([]), ['missing entry: W008'])
  ok(mapped([{ code: 'W008', by: 'compiler' }]).includes('missing emit: W008'))
  deepStrictEqual(mapped(), [])
})

test('CLI mentions, strings, comments and catalog entries are not coverage', () => {
  for (const text of [
    "// return { code: 'W008' }",
    'const text = "return { code: \'W008\' }"',
    "const catalog = [{ code: 'W008' }]",
    "format({ code: 'W008' })",
    "const pattern = /return { code: 'W008' }/",
    'const text = `return { code: "W008" }`',
    'const text = `a ${`nested`} return { code: "W008" }`',
  ])
    deepStrictEqual(mapped(mappedCatalog, { 'fake.cjs': text }), ['missing emit: W008'])
  for (const text of [
    "// expect(code).toBe('W008')",
    "const code = 'W008'",
    "describe('W008', () => {})",
    "other.toContain('W008')",
    'const text = `expect(code).toBe("W008")`',
  ])
    deepStrictEqual(mapped(mappedCatalog, cli.source, { 'fake.test.ts': text }), [
      'missing test: W008',
    ])
  deepStrictEqual(mapped(), [])
})

test('W030 graph emit, test and CLI ownership remain mandatory', () => {
  const catalog = [{ code: 'W030', by: 'cli' }]
  const source = { 'server-state-checks.mjs': "function run() { diagnostic({ code: 'W030' }) }" }
  const tests = { 'server-state-checks.test.ts': "expect(finding.code).toBe('W030')" }
  const run = (c = catalog, s = source, t = tests) =>
    compare(gaps(c, {}, {}, { source: s, tests: t }), [])
  deepStrictEqual(run(), [])
  deepStrictEqual(run(catalog, {}), ['missing emit: W030'])
  deepStrictEqual(run(catalog, source, {}), ['missing test: W030'])
  deepStrictEqual(run([]), ['missing entry: W030'])
  ok(run([{ code: 'W030', by: 'compiler' }]).includes('missing emit: W030'))
  ok(run([{ code: 'W030', by: 'start' }]).includes('unsupported owner: W030'))
  deepStrictEqual(run(catalog, { 'fake.mjs': "const metadata = { code: 'W030' }" }), [
    'missing emit: W030',
  ])
  deepStrictEqual(run(), [])
})

test('compiler entries in other catalog partitions require emits and assertions', () => {
  const compiler = [{ code: 'W001', by: 'compiler' }]
  const style = [{ code: 'D024', by: 'compiler' }]
  const source = { 'style.rs': 'Diagnostic::new(source, "D024", severity, span);' }
  const tests = { 'compile.rs': 'assert_eq!(codes(&d), ["D024"]);' }
  const baseSource = {
    ...source,
    'compiler.rs': 'Diagnostic::new(source, "W001", severity, span);',
  }
  const baseTests = { ...tests, 'other.rs': 'assert_eq!(codes(&d), ["W001"]);' }
  const check = (entries, emit = baseSource, coverage = baseTests) =>
    compare(gaps(entries, emit, coverage), [])
  deepStrictEqual(check([...compiler, ...style]), [])
  deepStrictEqual(check(compiler), ['missing entry: D024'])
  deepStrictEqual(check([...compiler, ...style], { 'compiler.rs': baseSource['compiler.rs'] }), [
    'missing emit: D024',
  ])
  deepStrictEqual(
    check([...compiler, ...style], baseSource, { 'other.rs': baseTests['other.rs'] }),
    ['missing test: D024'],
  )
  deepStrictEqual(check([...compiler, ...style]), [])
})

test('W007 requires CLI emit, assertion and truthful owner evidence', () => {
  const entries = [{ code: 'W007', by: 'cli' }]
  const source = { 'derived-writes.cjs': "function emit() { return { code: 'W007' } }" }
  const tests = { 'derived-writes.test.ts': "expect(result.code).toBe('W007')" }
  const run = (catalog = entries, emits = source, checks = tests) =>
    compare(gaps(catalog, {}, {}, { source: emits, tests: checks }), [])
  deepStrictEqual(run(), [])
  deepStrictEqual(run(entries, {}), ['missing emit: W007'])
  deepStrictEqual(run(entries, source, {}), ['missing test: W007'])
  deepStrictEqual(run([]), ['missing entry: W007'])
  ok(run([{ code: 'W007', by: 'compiler' }]).includes('missing emit: W007'))
  ok(run([{ code: 'W007', by: 'start' }]).includes('unsupported owner: W007'))
  deepStrictEqual(run(entries, { 'fake.cjs': "const entry = { code: 'W007' }" }), [
    'missing emit: W007',
  ])
  deepStrictEqual(run(entries, source, { 'fake.test.ts': "describe('W007', () => {})" }), [
    'missing test: W007',
  ])
  deepStrictEqual(run(), [])
})
