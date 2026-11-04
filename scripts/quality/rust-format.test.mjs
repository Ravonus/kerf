import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { test } from 'node:test'

const source = join(dirname(fileURLToPath(import.meta.url)), 'rust-format.mjs')

function command(dir, cmd, args) {
  return spawnSync(cmd, args, { cwd: dir, encoding: 'utf8' })
}

function fixture(t) {
  const dir = mkdtempSync(join(tmpdir(), 'weft-rust-format-'))
  t.after(() => rmSync(dir, { recursive: true, force: true }))
  mkdirSync(join(dir, 'scripts/quality'), { recursive: true })
  copyFileSync(source, join(dir, 'scripts/quality/rust-format.mjs'))
  writeFileSync(join(dir, 'rustfmt.toml'), 'max_width = 100\n')
  assert.equal(command(dir, 'git', ['init', '-q']).status, 0)
  return dir
}

function rustFile(dir, path, edition, sourceText) {
  const crate = join(dir, path)
  mkdirSync(join(crate, 'src'), { recursive: true })
  writeFileSync(join(crate, 'Cargo.toml'), `[package]\nname = "fixture"\nedition = "${edition}"\n`)
  writeFileSync(join(crate, 'src/lib.rs'), sourceText)
  assert.equal(command(dir, 'git', ['add', path]).status, 0)
}

function format(dir, ...args) {
  return command(dir, process.execPath, ['scripts/quality/rust-format.mjs', ...args])
}

await test('checks and repairs tracked files outside crates using their editions', (t) => {
  const dir = fixture(t)
  rustFile(dir, 'evals/old', '2021', 'pub fn gen( ){ }\n')
  rustFile(
    dir,
    'spikes/new',
    '2024',
    'pub fn run(value: Option<u8>){if let Some(value) = value && value > 0 { }}\n',
  )
  const checked = format(dir)
  assert.equal(checked.status, 1)
  assert.match(checked.stderr, /evals\/old\/src\/lib.rs/)
  assert.match(checked.stderr, /spikes\/new\/src\/lib.rs/)
  assert.equal(format(dir, '--write').status, 0)
  assert.match(readFileSync(join(dir, 'evals/old/src/lib.rs'), 'utf8'), /fn gen\(\) \{\}/)
  assert.equal(format(dir).status, 0)
})

await test('propagates formatter errors in check and write', (t) => {
  const dir = fixture(t)
  rustFile(dir, 'spikes/broken', '2024', 'fn broken( {\n')
  for (const args of [[], ['--write']]) {
    const result = format(dir, ...args)
    assert.equal(result.status, 1)
    assert.match(result.stderr, /spikes\/broken\/src\/lib.rs/)
  }
})
