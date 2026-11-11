import { strict as assert } from 'node:assert'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'
import { check, problemsFor } from './api-snapshots.mjs'

const exports = { '.': './index.ts', './test': { types: './test.d.ts', default: './test.js' } }
const snapshot = { exports }
const docs = '- `@kerf/core`: Root API.\n- `@kerf/core/test`: Tests.\n'

void test('detects added, removed and changed paths and conditions', () => {
  assert.deepEqual(problemsFor('core', exports, snapshot, docs), [])
  for (const bad of [
    { ...exports, './new': './new.ts' },
    { '.': exports['.'] },
    { ...exports, '.': './other.ts' },
    { ...exports, './test': { types: './other.d.ts', default: './test.js' } },
  ])
    assert.match(problemsFor('core', bad, snapshot, docs).join('\n'), /export map differs/)
  assert.match(problemsFor('core', exports, { exports: {} }, docs).join('\n'), /export map differs/)
})

void test('requires a reference entry for every path', () => {
  assert.match(
    problemsFor('core', exports, snapshot, '- `@kerf/core`: Root.\n').join('\n'),
    /missing reference for @kerf\/core\/test/,
  )
  assert.match(
    problemsFor('core', exports, snapshot, '- `@kerf/core/test`: \n').join('\n'),
    /missing reference/,
  )
})

void test('inventories all tracked core and start manifests and their export targets', () => {
  const result = check()
  assert.deepEqual(check(process.cwd()), result)
  const manifests = execFileSync(
    'git',
    ['ls-files', 'packages/core/package.json', 'packages/start/package.json'],
    { encoding: 'utf8' },
  )
    .trim()
    .split('\n')
  const count = manifests.reduce(
    (sum, path) => sum + Object.keys(JSON.parse(readFileSync(path, 'utf8')).exports).length,
    0,
  )
  assert.equal(result.manifests, manifests.length)
  assert.equal(result.count, count)
  assert.deepEqual(result.problems, [])
})
