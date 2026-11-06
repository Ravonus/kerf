import { test } from 'node:test'
import { deepStrictEqual, match, ok } from 'node:assert/strict'
import { typeProblems } from './types.mjs'

void test('checker exits and diagnostic exclusions', () => {
  for (const result of [
    { code: 1, out: '' },
    { code: 1, out: 'Error: spawn tsc ENOENT' },
    { code: null, out: 'checker crashed' },
  ]) {
    const problems = typeProblems('site', result)
    ok(problems.length, `must fail: ${JSON.stringify(result)}`)
    match(problems[0], /site/)
    if (result.out) match(problems[0], new RegExp(result.out))
  }
  const included = 'packages/core/a.ts(1,1): error TS1234: bad'
  const excluded = 'evals/a.ts(1,1): error TS1234: ignored'
  deepStrictEqual(typeProblems('.', { code: 1, out: included }), [included])
  deepStrictEqual(typeProblems('.', { code: 0, out: '' }), [])
  for (const path of ['evals', 'examples', 'packages/text/gen']) {
    deepStrictEqual(typeProblems('.', { code: 1, out: `${path}/a.ts: error TS1234: ignored` }), [])
  }
  deepStrictEqual(typeProblems('.', { code: 1, out: `${excluded}\n${included}` }), [included])
})
