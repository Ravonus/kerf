import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { categories, classify } from './categories.mjs'

test('roadmap rows and limits follow first-match order', () => {
  const fixtures = [
    ['x/utils/use-x.ts', 'util', 150, 40, 3],
    ['x/use-x.ts', 'hook', 200, 60, 3],
    ['x/src/A.tsx', 'component', 400, 80, 3],
    ['x/src/a.ts', 'module', 400, 80, 4],
    ['x/scripts/a.mjs', 'script', 400, 80, 4],
    ['x/test/a.test.ts', 'test', 750, 120, 4],
    ['x/types/a.ts', 'types', 1000, null, null],
    ['x/generated/a.ts', 'table', 1000, null, null],
    ['crates/a/src/a.rs', 'rust', 400, 80, 5],
  ]
  assert.equal(fixtures.length, categories.length)
  for (const [path, name, file, fn, params] of fixtures) {
    const category = classify(path)
    assert.deepEqual([category.name, category.file, category.function, category.params], [name, file, fn, params])
  }
  assert.equal(classify('unknown.txt'), undefined)
})

test('tracked shapes and overlaps obey the table order', () => {
  for (const [path, expected] of [
    ['packages/text/vendor/pretext/src/generated/engine-break-data.ts', 'module'],
    ['packages/warp-core/styles/app/tokens.css', 'table'],
    ['crates/weft-compiler/tests/compile.rs', 'table'],
    ['packages/core/vitest.config.ts', 'script'],
    ['tsconfig.base.json', 'script'],
    ['packages/start/test/fixtures/app/weft.config.ts', 'script'],
    ['packages/a/src/types.ts', 'module'],
    ['packages/a/src/foo-state.ts', 'hook'],
  ]) assert.equal(classify(path)?.name, expected, path)
})
