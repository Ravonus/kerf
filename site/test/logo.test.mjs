import { test } from 'node:test'
import { strict as assert } from 'node:assert'
import { stale } from '../scripts/logo.mjs'

await test('the committed logo files are what the mark draws', () => {
  assert.deepEqual(
    stale().map(([path]) => path),
    [],
    'run `node scripts/logo.mjs` in site/',
  )
})
