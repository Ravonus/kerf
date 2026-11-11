import assert from 'node:assert/strict'
import { existsSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join, relative, sep } from 'node:path'
import { test } from 'node:test'
import { checkPackedCrate, forceWasmCompiler } from '../../packages/create-kerf/scripts/packed-paths.mjs'

function fixture(run) {
  const root = mkdtempSync(join(tmpdir(), 'kerf-packed-paths-'))
  const app = join(root, 'app')
  mkdirSync(join(app, 'node_modules/@kerf-js'), { recursive: true })
  try {
    run(app, root)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

await test('Rust crate checks accept pnpm paths and reject a different crate', () =>
  fixture((app) => {
    const crate = join(app, 'node_modules/.pnpm/start/node_modules/@kerf-js/start/crate')
    mkdirSync(crate, { recursive: true })
    mkdirSync(join(app, 'crates/hasher'), { recursive: true })
    symlinkSync(dirname(crate), join(app, 'node_modules/@kerf-js/start'), 'junction')
    const path = relative(join(app, 'crates/hasher'), crate).split(sep).join('/')
    const dependency = `kerf = { path = "${path}", features = ["native"] }`
    const manifest = `[dependencies]\n${dependency}\n[build-dependencies]\n${dependency}\n`
    checkPackedCrate(app, manifest)
    assert.throws(() => checkPackedCrate(app, dependency), /shipped by/)
    const other = join(app, 'other')
    mkdirSync(other)
    assert.throws(() => checkPackedCrate(app, manifest.replace(path, '../../other')), /shipped by/)
  }))

function nativeFixture(app, parent) {
  const core = join(parent, 'node_modules/@kerf-js/core')
  const addon = join(parent, 'node_modules/@kerf-js/compiler-test')
  mkdirSync(core, { recursive: true })
  mkdirSync(addon, { recursive: true })
  writeFileSync(join(core, 'package.json'), '{"name":"@kerf-js/core"}')
  writeFileSync(
    join(addon, 'package.json'),
    '{"name":"@kerf-js/compiler-test","main":"addon.node"}',
  )
  const native = join(addon, 'addon.node')
  writeFileSync(native, 'test marker; not loaded')
  symlinkSync(core, join(app, 'node_modules/@kerf-js/core'), 'junction')
  return native
}

await test('WASM forcing removes the addon resolved inside the pnpm app', () =>
  fixture((app) => {
    const native = nativeFixture(app, join(app, 'node_modules/.pnpm/core'))
    forceWasmCompiler(app, 'compiler-test')
    assert.equal(existsSync(native), false)
  }))

await test('WASM forcing preserves an addon outside the owned app', () =>
  fixture((app, root) => {
    const native = nativeFixture(app, join(root, 'external'))
    assert.throws(() => forceWasmCompiler(app, 'compiler-test'), /outside the packed app/)
    assert.equal(existsSync(native), true)
  }))
