// Exercise the guard against tracked consumers in a temporary repository.
import { strict as assert } from 'node:assert'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { check } from './shared-helpers.mjs'

void test('checks tracked setup files and rejects duplicate helpers', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-helpers-'))
  const git = (...args) => execFileSync('git', args, { cwd: dir, stdio: 'ignore' })
  try {
    git('init', '-q')
    mkdirSync(join(dir, 'packages/demo/test'), { recursive: true })
    const file = join(dir, 'packages/demo/test/server.setup.mjs')
    writeFileSync(file, "import { freePort } from '../../../scripts/lib/helpers.mjs'\n")
    git('add', 'packages/demo/test/server.setup.mjs')
    assert.equal(check(dir).files.length, 1)
    assert.deepEqual(check(dir).problems, [])
    writeFileSync(file, 'const freePort = () => 42\n')
    assert.match(check(dir).problems[0], /duplicate freePort/)
    const cli = spawnSync(process.execPath, [
      new URL('./shared-helpers.mjs', import.meta.url).pathname,
      dir,
    ])
    assert.equal(cli.status, 1)
    writeFileSync(file, 'const delay = (ms) => new Promise((ok) => setTimeout(ok, ms))\n')
    assert.match(check(dir).problems[0], /duplicate sleep/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
