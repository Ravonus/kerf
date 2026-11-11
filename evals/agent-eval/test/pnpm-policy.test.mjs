import assert from 'node:assert/strict'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { normalizeOverrides, pnpmEnv, POLICY, writePolicy } from '../lib/pnpm-policy.mjs'

test('standalone policy keeps the age floor and rejects replacement', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-policy-'))
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

test('manifest overrides merge into the workspace and conflicts fail closed', () => {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-override-'))
  try {
    const pkg = {
      overrides: { inherited: '1.2.3' },
      pnpm: {
        overrides: { inherited: '1.2.3', '@kerf-js/core': 'file:/tmp/core.tgz' },
        other: true,
      },
    }
    writeFileSync(join(dir, 'package.json'), JSON.stringify(pkg))
    writeFileSync(
      join(dir, 'pnpm-workspace.yaml'),
      'minimumReleaseAge: 4320\noverrides:\n  "miniflare>undici": 7.30.1\n',
    )
    assert.equal(normalizeOverrides(dir), true)
    const policy = readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')
    assert.match(policy, /minimumReleaseAge: 4320/)
    assert.match(policy, /"miniflare>undici": 7.30.1/)
    assert.match(policy, /"inherited": "1.2.3"/)
    assert.match(policy, /"@kerf-js\/core": "file:\/tmp\/core.tgz"/)
    assert.deepEqual(JSON.parse(readFileSync(join(dir, 'package.json'))), { pnpm: { other: true } })
    assert.equal(normalizeOverrides(dir), false)
    writeFileSync(
      join(dir, 'package.json'),
      JSON.stringify({ pnpm: { overrides: { inherited: '9.9.9' } } }),
    )
    assert.throws(() => normalizeOverrides(dir), /workspace override conflicts: inherited/)
    assert.equal(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8'), policy)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
