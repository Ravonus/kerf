import { test } from 'node:test'
import assert from 'node:assert/strict'
import { categoryConfig, configDrift } from './category-overrides.mjs'

void test('generated config matches and mutated limits drift', () => {
  const files = [{ path: 'packages/a/src/utils/x.ts' }, { path: 'packages/a/src/View.tsx' }]
  const config = categoryConfig(files)
  assert.equal(configDrift(config, files), false)
  config.overrides[0].rules['max-params'][1].max++
  assert.equal(configDrift(config, files), true)
  assert.equal(configDrift({ ...categoryConfig(files), rules: {} }, files), true)
})

void test('CLI generates a config and rejects drift', async () => {
  const { mkdtempSync, writeFileSync, rmSync } = await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join } = await import('node:path')
  const { spawnSync } = await import('node:child_process')
  const dir = mkdtempSync(join(tmpdir(), 'weft-overrides-'))
  try {
    const script = 'scripts/quality/category-overrides.mjs'
    const generate = spawnSync(process.execPath, [script, '--generate'], { encoding: 'utf8' })
    assert.equal(generate.status, 0, generate.stderr)
    const config = JSON.parse(generate.stdout)
    const path = join(dir, 'config.json')
    config.overrides[0].rules['max-lines'][1].max++
    writeFileSync(path, JSON.stringify(config))
    const bad = spawnSync(process.execPath, [script, '--check', path], { encoding: 'utf8' })
    assert.equal(bad.status, 1)
    assert.match(bad.stderr, /Category override drift/)
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
