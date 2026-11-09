import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { duplicates, tracked } from './duplicates.mjs'

void test('finds repeated windows, ignoring comments and whitespace but preserving strings', () => {
  const code = Array.from({ length: 12 }, (_, i) => `call${i}("// value ${i}");`).join('\n')
  const commented = code.replaceAll(';', '; // comment')
  assert.equal(duplicates([['a.ts', code], ['b.ts', commented]]).length, 1)
  assert.equal(duplicates([['a.ts', code], ['b.ts', commented.replace('value 3', 'other 3')]]).length, 0)
  assert.equal(duplicates([['a.ts', code], ['b.ts', code.replaceAll('call', 'other')]]).length, 0)
})

void test('coverage matches tracked source and test extensions', () => {
  const all = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0')
  const expected = all.filter((path) => /\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts|rs)$/.test(path))
  assert.deepEqual(tracked(), expected)
})
