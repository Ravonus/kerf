import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { structure } from './structure.mjs'

test('reports bad paths and index content, and accepts good fixtures', () => {
  const good = ['packages/a/src/Alpha.tsx', 'packages/a/src/foo.ts', 'packages/a/src/index.ts']
  assert.deepEqual(structure(good, () => "export { foo } from './foo'\n").warnings, [])
  const bad = [...Array.from({ length: 13 }, (_, i) => `packages/a/src/file-${i}.ts`), 'packages/a/src/Bad_name.ts', 'packages/a/src/index.ts', 'packages/a/src/small/x.ts']
  const warnings = structure(bad, () => 'export const x = 1') .warnings
  assert.ok(warnings.some((s) => s.includes('maximum 12')))
  assert.ok(warnings.some((s) => s.includes('minimum 3')))
  assert.ok(warnings.some((s) => s.includes('kebab-case')))
  assert.ok(warnings.some((s) => s.includes('only re-export')))
})
