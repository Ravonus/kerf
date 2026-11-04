import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { freePort, median, repoRoot, sleep, until, walk } from './helpers.mjs'

test('shared helpers retain their results', async () => {
  assert.equal(repoRoot, process.cwd())
  assert.equal(median([4, 1, 2, 3]), 2.5)
  assert.equal(median([3, 1, 2]), 2)
  assert.ok(Number.isNaN(median([])))
  assert.ok((await freePort()) > 0)
  await sleep(0)
  assert.equal(await until('value', () => 7), 7)
})

test('walk skips named directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-walk-'))
  try {
    mkdirSync(join(root, 'skip'))
    writeFileSync(join(root, 'skip', 'hidden'), '')
    writeFileSync(join(root, 'visible'), '')
    const found = []
    walk(
      root,
      (path) => found.push(path),
      (name) => name === 'skip',
    )
    assert.deepEqual(found, [join(root, 'visible')])
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
