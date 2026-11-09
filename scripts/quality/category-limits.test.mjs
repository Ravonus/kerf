import { test } from 'node:test'
import assert from 'node:assert/strict'
import { measure, overrides, overrideDrift } from './category-limits.mjs'

void test('category limits report bad file, function and parameter counts', () => {
  const text = `function work(a,b,c,d) {\n${'const x = 1;\n'.repeat(150)}return a\n}`
  const result = measure('app/src/utils/x.ts', text)
  assert.deepEqual(
    result.findings.map((f) => f.kind),
    ['file', 'function', 'params'],
  )
  assert.deepEqual(measure('app/src/utils/x.ts', 'function work(a) { return a }').findings, [])
})

void test('null limits and first match are preserved', () => {
  const result = measure('app/types/x.ts', 'function f(a,b,c,d,e) { return a }')
  assert.equal(result.category, 'types')
  assert.deepEqual(result.findings, [])
  assert.equal(measure('app/src/types.ts', '').category, 'module')
})

void test('override drift detects changes and keeps first-match disjoint paths', () => {
  const files = [{ path: 'app/src/utils/x.ts' }, { path: 'app/src/X.tsx' }]
  const result = overrides(files)
  assert.equal(overrideDrift(result, files), false)
  assert.equal(result[0].rules['max-params'][1].max, 3)
  result[0].rules['max-params'][1].max = 4
  assert.equal(overrideDrift(result, files), true)
})
