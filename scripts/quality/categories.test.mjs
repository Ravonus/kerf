import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { classify } from './categories.mjs'

test('first matching category supplies limits', () => {
  assert.equal(classify('packages/a/src/utils/use-x.ts').name, 'util')
  assert.equal(classify('packages/a/src/use-x.ts').name, 'hook')
  assert.equal(classify('packages/a/src/Button.tsx').file, 400)
  assert.equal(classify('packages/a/test/a.test.ts').name, 'test')
  assert.equal(classify('unknown.txt'), undefined)
})
