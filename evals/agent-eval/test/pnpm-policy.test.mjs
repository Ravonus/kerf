import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { pnpmEnv, POLICY, writePolicy } from '../lib/pnpm-policy.mjs'

test('standalone policy keeps the age floor and rejects replacement', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-policy-'))
  try {
    writePolicy(dir)
    assert.equal(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8'), POLICY)
    assert.match(POLICY, /minimumReleaseAge: 4320/)
    assert.throws(() => writePolicy(dir), { code: 'EEXIST' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})

test('inherited overrides cannot bypass the policy', () => {
  const env = pnpmEnv(
    { PATH: '/bin', npm_config_min_release_age: '0', PNPM_HOME: '/bad' },
    'http://localhost:4873/',
  )
  assert.deepEqual(env, { PATH: '/bin', npm_config_registry: 'http://localhost:4873/' })
})
