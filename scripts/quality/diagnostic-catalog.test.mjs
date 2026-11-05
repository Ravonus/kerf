import { test } from 'node:test'
import { deepStrictEqual, ok } from 'node:assert/strict'
import { gaps, compare } from './diagnostic-catalog.mjs'

const catalog = [{ code: 'W001', by: 'compiler' }]
const source = { 'source.rs': 'Diagnostic::new(source, "W001", severity, span);' }
const tests = { 'compile.rs': 'assert_eq!(codes(&d), ["W001"]);' }
const run = (c = catalog, s = source, t = tests, baseline = []) =>
  compare(gaps(c, s, t), baseline)

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
