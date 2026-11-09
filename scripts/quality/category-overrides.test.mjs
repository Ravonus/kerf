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

void test('category warnings do not hide independently enforced lint errors', async () => {
  const { mkdtempSync, mkdirSync, writeFileSync, rmSync, existsSync, readdirSync } =
    await import('node:fs')
  const { tmpdir } = await import('node:os')
  const { join, resolve } = await import('node:path')
  const { spawnSync } = await import('node:child_process')
  const { runCategoryLint } = await import('./category-overrides.mjs')
  const dir = mkdtempSync(join(tmpdir(), 'weft-category-run-'))
  try {
    mkdirSync(join(dir, 'src/utils'), { recursive: true })
    const path = 'src/utils/test.ts'
    const content = 'function f(a,b,c,d) { return a }\nf(1,2,3,4)\n'
    writeFileSync(join(dir, path), content)
    const local = resolve('node_modules/.bin/oxlint')
    const binary = existsSync(local) ? local : resolve('../../weft/node_modules/.bin/oxlint')
    const warnings = []
    runCategoryLint({
      files: [{ path, content }],
      cwd: dir,
      binary,
      print: (line) => warnings.push(line),
    })
    assert.ok(
      warnings.some((line) => line.includes('max-params')),
      JSON.stringify(warnings),
    )
    assert.equal(
      readdirSync(dir).some((name) => name.startsWith('.weft-category-')),
      false,
    )
    writeFileSync(
      join(dir, '.oxlintrc.json'),
      JSON.stringify({
        categories: { correctness: 'off', suspicious: 'off' },
        rules: { 'no-unused-vars': 'error' },
      }),
    )
    const enforced = spawnSync(binary, ['--format', 'json', path], { cwd: dir, encoding: 'utf8' })
    assert.equal(enforced.status, 1)
    assert.ok(
      JSON.parse(enforced.stdout).diagnostics.some(
        (d) => d.severity === 'error' && d.code.includes('no-unused-vars'),
      ),
    )
    assert.throws(
      () => runCategoryLint({ files: [{ path, content }], cwd: dir, binary: join(dir, 'missing') }),
      /Category lint failed/,
    )
    assert.equal(
      readdirSync(dir).some((name) => name.startsWith('.weft-category-')),
      false,
    )
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
