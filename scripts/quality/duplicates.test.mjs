import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { test } from 'node:test'
import { duplicates, tracked } from './duplicates.mjs'

void test('finds repeated windows, ignoring comments and whitespace but preserving strings', () => {
  const code = Array.from({ length: 12 }, (_, i) => `call${i}("// value ${i}");`).join('\n')
  const commented = code.replaceAll(';', '; // comment')
  assert.equal(
    duplicates([
      ['a.ts', code],
      ['b.ts', commented],
    ]).length,
    1,
  )
  assert.equal(
    duplicates([
      ['a.ts', code],
      ['b.ts', commented.replace('value 3', 'other 3')],
    ]).length,
    0,
  )
  assert.equal(
    duplicates([
      ['a.ts', code],
      ['b.ts', code.replaceAll('call', 'other')],
    ]).length,
    0,
  )
})

void test('coverage matches tracked source and test extensions', () => {
  const all = execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0')
  const expected = all.filter((path) => /\.(?:js|jsx|ts|tsx|mjs|cjs|mts|cts|rs)$/.test(path))
  assert.deepEqual(tracked(), expected)
})

void test('preserves Rust raw strings and ignores nested block comments', () => {
  const lines = Array.from(
    { length: 12 },
    (_, i) => `let value${i} = r##"text // ${i} /* kept */"##;`,
  ).join('\n')
  const commented = lines.replace('let value5', '/* outer /* nested */ tail */ let value5')
  assert.equal(
    duplicates([
      ['a.rs', lines],
      ['b.rs', commented],
    ]).length,
    1,
  )
  assert.equal(
    duplicates([
      ['a.rs', lines],
      ['b.rs', commented.replace('text // 5', 'different // 5')],
    ]).length,
    0,
  )
})

void test('preserves regex and nested template contents', () => {
  const regex = Array.from({ length: 12 }, (_, i) => `const r${i} = /[/*]value${i}\\/end/g;`).join(
    '\n',
  )
  assert.equal(
    duplicates([
      ['a.js', regex],
      ['b.js', regex.replace('value5', 'other5')],
    ]).length,
    0,
  )
  const template = Array.from(
    { length: 12 },
    (_, i) => 'const t' + i + ' = `text ${`nested // ' + i + '`}`;',
  ).join('\n')
  assert.equal(
    duplicates([
      ['a.js', template],
      ['b.js', template.replace('nested // 5', 'other // 5')],
    ]).length,
    0,
  )
  assert.equal(
    duplicates([
      ['a.js', template],
      ['b.js', template.replace('const t5', '/* comment */ const t5')],
    ]).length,
    1,
  )
})
