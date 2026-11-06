import { test } from 'node:test'
import { deepStrictEqual, ok } from 'node:assert/strict'
import { gaps, compare } from './diagnostic-catalog.mjs'

const baseCatalog = [{ code: 'W001', by: 'compiler' }]
const baseSource = { 'source.rs': 'Diagnostic::new(source, "W001", severity, span);' }
const baseTests = { 'compile.rs': 'assert_eq!(codes(&d), ["W001"]);' }
const runBase = (c = baseCatalog, s = baseSource, t = baseTests, baseline = []) =>
  compare(gaps(c, s, t), baseline)

void test('valid inputs and repaired gaps pass', () => {
  deepStrictEqual(runBase(), [])
  for (const [bad, expected] of [
    [runBase([], baseSource, baseTests), 'missing entry: W001'],
    [runBase(baseCatalog, {}, baseTests), 'missing emit: W001'],
    [runBase(baseCatalog, baseSource, {}), 'missing test: W001'],
  ]) {
    ok(bad.includes(expected))
    deepStrictEqual(runBase(), [])
  }
})

void test('baseline admits current gaps but rejects stale entries', () => {
  const baseline = ['missing test: W001']
  deepStrictEqual(runBase(baseCatalog, baseSource, {}, baseline), [])
  deepStrictEqual(runBase(baseCatalog, baseSource, baseTests, baseline), [
    'stale baseline: missing test: W001',
  ])
  deepStrictEqual(runBase(), [])
})

void test('unknown dynamic constructor fails', () => {
  const problems = runBase(
    baseCatalog,
    { 'source.rs': 'Diagnostic::new(source, code, severity);' },
    baseTests,
  )
  ok(problems.some((problem) => problem.includes('unrecognized constructor')))
  deepStrictEqual(runBase(), [])
})

const mappedCatalog = [{ code: 'W008', by: 'cli' }]
const cli = {
  source: { 'packages/cli/src/box.cjs': "function emit() { return { code: 'W008' } }" },
  tests: { 'packages/cli/test/box.test.ts': "expect(result.code).toBe('W008')" },
}
const mapped = (c = mappedCatalog, s = cli.source, t = cli.tests) =>
  compare(gaps(c, {}, {}, { source: s, tests: t }), [])

void test('mapped CLI rules require both real emit and assertion sites', () => {
  deepStrictEqual(mapped(), [])
  deepStrictEqual(mapped(mappedCatalog, {}), ['missing emit: W008'])
  deepStrictEqual(mapped(mappedCatalog, cli.source, {}), ['missing test: W008'])
  deepStrictEqual(mapped([]), ['missing entry: W008'])
  ok(mapped([{ code: 'W008', by: 'compiler' }]).includes('missing emit: W008'))
  deepStrictEqual(mapped(), [])
})

void test('CLI mentions, strings, comments and catalog entries are not coverage', () => {
  for (const text of [
    "// return { code: 'W008' }",
    'const text = "return { code: \'W008\' }"',
    "const catalog = [{ code: 'W008' }]",
    "format({ code: 'W008' })",
    "const pattern = /return { code: 'W008' }/",
    'const text = `return { code: "W008" }`',
    `const text = \`a \${\`nested\`} return { code: "W008" }\``,
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

void test('W030 graph emit, test and CLI ownership remain mandatory', () => {
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

void test('compiler entries in other catalog partitions require emits and assertions', () => {
  const compiler = [{ code: 'W001', by: 'compiler' }]
  const style = [{ code: 'D024', by: 'compiler' }]
  const source = { 'style.rs': 'Diagnostic::new(source, "D024", severity, span);' }
  const tests = { 'compile.rs': 'assert_eq!(codes(&d), ["D024"]);' }
  const mergedSource = {
    ...source,
    'compiler.rs': 'Diagnostic::new(source, "W001", severity, span);',
  }
  const mergedTests = { ...tests, 'other.rs': 'assert_eq!(codes(&d), ["W001"]);' }
  const check = (entries, emit = mergedSource, coverage = mergedTests) =>
    compare(gaps(entries, emit, coverage), [])
  deepStrictEqual(check([...compiler, ...style]), [])
  deepStrictEqual(check(compiler), ['missing entry: D024'])
  deepStrictEqual(check([...compiler, ...style], { 'compiler.rs': mergedSource['compiler.rs'] }), [
    'missing emit: D024',
  ])
  deepStrictEqual(
    check([...compiler, ...style], mergedSource, { 'other.rs': mergedTests['other.rs'] }),
    ['missing test: D024'],
  )
  deepStrictEqual(check([...compiler, ...style]), [])
})

void test('W007 requires CLI emit, assertion and truthful owner evidence', () => {
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
