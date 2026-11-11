import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { test } from 'node:test'

const gate = resolve(import.meta.dirname, 'conventions.mjs')

function probe(contents) {
  const dir = mkdtempSync(join(tmpdir(), 'kerf-conventions-edge-'))
  const env = { ...process.env }
  delete env.NODE_TEST_CONTEXT
  try {
    execFileSync('git', ['init', '-q'], { cwd: dir, env })
    for (const [file, text] of Object.entries(contents)) {
      mkdirSync(dirname(join(dir, file)), { recursive: true })
      writeFileSync(join(dir, file), text)
    }
    execFileSync('git', ['add', '--', 'packages'], { cwd: dir, env })
    return spawnSync(process.execPath, [gate], { cwd: dir, env, encoding: 'utf8' })
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const manifest = 'packages/example/package.json'
const helper = 'packages/example/src/helper.mjs'
const bin = 'packages/example/bin/run.mjs'
const orphan = `${helper}: source must be TypeScript or reachable from an untranspiled Node entry`

void test('commented imports do not make source reachable', () => {
  for (const text of [
    "// import '../src/helper.mjs'",
    "/* import '../src/helper.mjs' */",
    "const x = 1; // import '../src/helper.mjs'",
  ]) {
    const result = probe({ [manifest]: '{}', [bin]: text, [helper]: '' })
    assert.equal(result.status, 1, result.stdout + result.stderr)
    assert.ok(result.stderr.includes(orphan), result.stderr)
  }
})

void test('manifest metadata is not an executable entry', () => {
  const result = probe({
    [manifest]:
      '{"description":"./src/helper.mjs","files":["./src/helper.mjs"],"types":"./src/helper.mjs","scripts":{"echo":"echo ./src/helper.mjs"}}',
    [helper]: '',
  })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(result.stderr, new RegExp(orphan))
})

void test('misplaced spec tests are rejected', () => {
  const file = 'packages/example/src/widget.spec.ts'
  const result = probe({ [manifest]: '{}', [file]: '' })
  assert.equal(result.status, 1, result.stdout + result.stderr)
  assert.match(
    result.stderr,
    /packages\/example\/src\/widget\.spec\.ts: put package tests in test\//,
  )
})

void test('generated imports, literals, regular expressions and Node contracts remain valid', () => {
  const result = probe({
    [manifest]: JSON.stringify({ description: 'not a root', exports: { '.': './src/helper.mjs' } }),
    [bin]:
      "const regex = /\\/\\/ import/; const url = 'https://example.test'; const generated = `import '../src/generated.mjs'`;",
    [helper]: '',
    'packages/example/src/generated.mjs': '',
  })
  assert.equal(result.status, 0, result.stdout + result.stderr)
})

void test('manifest executable and public import contracts keep their source entries', () => {
  for (const contract of [
    { bin: './src/helper.mjs' },
    { main: './src/helper.mjs' },
    { exports: { '.': { node: './src/helper.mjs' } } },
    { imports: { '#helper': './src/helper.mjs' } },
    { scripts: { run: 'node ./src/helper.mjs' } },
  ]) {
    const result = probe({ [manifest]: JSON.stringify(contract), [helper]: '' })
    assert.equal(result.status, 0, result.stdout + result.stderr)
  }
})
