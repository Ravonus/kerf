import { test } from 'node:test'
import assert from 'node:assert/strict'
import { analyzeComments } from './comment-budget.mjs'

const code = Array.from({ length: 20 }, (_, i) => `const x${i} = ${i};`).join('\n')
test('good comments pass and strings are not comments', () => {
  const result = analyzeComments(`${code}\nconst url = 'https://example.com/*x*/';\n// why`)
  assert.equal(result.commentLines, 1)
  assert.deepEqual(result.warnings, [])
})
test('ratio, long blocks and narration produce warnings', () => {
  const result = analyzeComments('/*\n one\n two\n three\n four\n five\n Sprint 9\n*/\nconst x = 1')
  assert.deepEqual(result.warnings.map((item) => item.rule), ['block', 'narration', 'ratio'])
})
test('documentation examples may exceed the block limit', () => {
  const result = analyzeComments(`${code}\n/**\n * @example\n * one\n * two\n * three\n * four\n * five\n */\nexport const x = 1`)
  assert.equal(result.warnings.some((item) => item.rule === 'block'), false)
})

test('consecutive line comments form a block', () => {
  const result = analyzeComments(`${code}\n${Array(7).fill('// reason').join('\n')}`)
  assert.equal(result.warnings.some((item) => item.rule === 'block'), true)
})
