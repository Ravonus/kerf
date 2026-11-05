import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'
import { conventions, tracked } from './conventions.mjs'

const root = resolve(import.meta.dirname, '../..')
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' })

void test('inventory covers Git paths in every checked category', () => {
  const files = tracked(root)
  const result = conventions(files, root)
  const count = (pattern) => git('ls-files', '-z', '--', pattern).split('\0').filter(Boolean).length
  assert.equal(
    files.length,
    git('ls-files', '-z', '--', 'packages').split('\0').filter(Boolean).length,
  )
  assert.equal(result.counts.source, count(':(glob)packages/*/src/**'))
  assert.equal(result.counts.tests, count(':(glob)packages/*/test/**'))
  assert.equal(result.counts.configs, count(':(glob)packages/*/vitest.config.*'))
  assert.deepEqual(result.problems, [])
})

void test('check propagates tracked source, test, e2e and config violations', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-conventions-'))
  const env = { ...process.env, GIT_INDEX_FILE: join(dir, 'index') }
  delete env.NODE_TEST_CONTEXT
  const files = [
    'packages/warp/src/conventions-t22-invalid.mjs',
    'packages/warp/test/conventions-t22.test.mjs',
    'packages/warp/test/conventions-t22.spec.ts',
    'packages/warp/scripts/conventions-t22.test.ts',
    'packages/warp/scripts/conventions-t22-e2e.mjs',
    'packages/warp/vitest.config.mjs',
  ]
  try {
    execFileSync('git', ['read-tree', 'HEAD'], { cwd: root, env })
    const baseline = spawnSync(process.execPath, ['scripts/check.mjs', '--only=conventions'], {
      cwd: root,
      env,
      encoding: 'utf8',
    })
    assert.equal(baseline.status, 0, baseline.stdout + baseline.stderr)
    for (const file of files) {
      mkdirSync(dirname(join(root, file)), { recursive: true })
      writeFileSync(join(root, file), '')
    }
    execFileSync('git', ['add', '-f', '--', ...files], { cwd: root, env })
    const result = spawnSync(process.execPath, ['scripts/check.mjs', '--only=conventions'], {
      cwd: root,
      env,
      encoding: 'utf8',
    })
    assert.equal(result.status, 1, result.stderr)
    for (const file of files)
      assert.ok(result.stdout.includes(file), `${file} missing: ${result.stdout}`)
    assert.match(result.stdout, /check: conventions failed/)
    execFileSync(
      'git',
      ['update-index', '--force-remove', ...files, 'packages/warp/vitest.config.ts'],
      {
        cwd: root,
        env,
      },
    )
    const missing = spawnSync(process.execPath, ['scripts/check.mjs', '--only=conventions'], {
      cwd: root,
      env,
      encoding: 'utf8',
    })
    assert.equal(missing.status, 1)
    assert.match(
      missing.stdout,
      /packages\/warp\/package.json: Vitest package needs vitest.config.ts/,
    )
  } finally {
    for (const file of files) rmSync(join(root, file), { force: true })
    rmSync(dir, { recursive: true, force: true })
  }
})

void test('Node entries allow their real import and URL closure but reject an orphan', () => {
  const dir = mkdtempSync(join(tmpdir(), 'weft-node-entry-'))
  const contents = {
    'packages/example/package.json': '{"name":"example"}',
    'packages/example/bin/run.mjs': "import '../src/entry.mjs'",
    'packages/example/src/entry.mjs': "new URL('./asset.mjs', import.meta.url)",
    'packages/example/src/asset.mjs': '',
    'packages/example/src/orphan.mjs': '',
  }
  try {
    for (const [file, text] of Object.entries(contents)) {
      mkdirSync(dirname(join(dir, file)), { recursive: true })
      writeFileSync(join(dir, file), text)
    }
    const result = conventions(Object.keys(contents), dir)
    assert.deepEqual(result.problems, [
      'packages/example/src/orphan.mjs: source must be TypeScript or reachable from an untranspiled Node entry',
    ])
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
})
