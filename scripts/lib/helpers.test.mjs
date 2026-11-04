import { strict as assert } from 'node:assert'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'
import { freePort, median, repoRoot, sleep, until, upperMedian, walk } from './helpers.mjs'

void test('shared helpers retain their results', async () => {
  const probe = spawnSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `import { repoRoot } from ${JSON.stringify(pathToFileURL(join(repoRoot, 'scripts/lib/helpers.mjs')).href)}; console.log(repoRoot)`,
    ],
    { cwd: tmpdir(), encoding: 'utf8' },
  )
  assert.equal(probe.status, 0)
  assert.equal(probe.stdout.trim(), repoRoot)
  assert.equal(median([4, 1, 2, 3]), 2.5)
  assert.equal(upperMedian([4, 1, 2, 3]), 3)
  assert.equal(upperMedian([]), undefined)
  assert.equal(median([3, 1, 2]), 2)
  assert.ok(Number.isNaN(median([])))
  assert.ok((await freePort()) > 0)
  await sleep(0)
  assert.equal(await until('value', () => 7), 7)
})

void test('walk skips named directories', () => {
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
