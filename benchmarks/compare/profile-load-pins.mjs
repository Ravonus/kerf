// Pin the checkout, installed lockfiles, compiler and prebuilt assets for manager-run profiles.
import assert from 'node:assert/strict'
import { requireSix } from './profile-load-data.mjs'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, lstatSync, readFileSync, readdirSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { arch, cpus, homedir, hostname, platform, release, totalmem } from 'node:os'
import { dirname, join, relative, resolve } from 'node:path'
import { resources } from './profile-load-resources.mjs'

export { resources }

export const MAX_OUTPUT = 256 * 1024 ** 2
export const MAX_TRACE = 8 * 1024 ** 2
export const MAX_CPU = 4 * 1024 ** 2
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const git = (repo, ...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()

/** These CLIs run in the manager-owned Yuna lease with its explicit Node26 toolchain. */
export function managerRoot(repo, out) {
  const root = join(homedir(), 'work/weft-S5-perf')
  assert.equal(realpathSync(repo), join(root, 'repo'), 'Use the exclusive perf checkout')
  assert.equal(realpathSync(root), root, 'No symlinked staging root')
  assert.equal(platform(), 'darwin')
  assert.equal(arch(), 'arm64')
  assert.equal(process.version, 'v26.13.0')
  assert.equal(
    realpathSync(process.execPath),
    realpathSync(join(homedir(), 'work/toolchain/node-v26.13.0-darwin-arm64/bin/node')),
  )
  assert.ok(
    dirname(resolve(out)) === root && resolve(out) !== repo,
    'Output must be outside the checkout, inside the owned perf root',
  )
  git(repo, 'rev-parse', '--verify', 'origin/main^{commit}')
  resources(root, 512 * 1024 ** 2)
  return root
}

/** Query the selected executable in the checkout, independently of the launcher's package manager. */
export function pnpmVersion(repo, tool = { command: 'pnpm', env: process.env }) {
  const version = execFileSync(tool.command, ['--version'], {
    cwd: repo,
    env: tool.env,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  }).trim()
  const expected = JSON.parse(readFileSync(join(repo, 'package.json'))).packageManager
  assert.equal('pnpm@' + version, expected, 'Selected pnpm version mismatch')
  return version
}

/** Record a clean Git tree, actual install records and matching compiler bytes. */
export function sourcePins(repo, stacks, tool) {
  assert.equal(git(repo, 'status', '--porcelain'), '', 'Build/profile requires a clean worktree')
  const files = [
    'package.json',
    '.nvmrc',
    'pnpm-workspace.yaml',
    'pnpm-lock.yaml',
    'benchmarks/compare/pnpm-workspace.yaml',
    'benchmarks/compare/pnpm-lock.yaml',
    'node_modules/.modules.yaml',
    'node_modules/.pnpm/lock.yaml',
    'benchmarks/compare/node_modules/.modules.yaml',
    'benchmarks/compare/node_modules/.pnpm/lock.yaml',
  ]
  for (const name of ['core', 'warp', 'warp-core', 'text'])
    files.push(`packages/${name}/package.json`)
  for (const stack of stacks) files.push(`benchmarks/compare/${stack.name}/package.json`)
  const require = createRequire(join(repo, 'packages/core/package.json'))
  const compiler = require('./compiler.cjs').backend
  const stamp = require('./scripts/native-stamp.cjs').sourceStamp()
  assert.equal(compiler.kind, 'native', 'Build/profile pins WEFT_COMPILER=native')
  assert.ok(
    stamp && readFileSync(compiler.file + '.stamp', 'utf8').trim() === stamp,
    'Compiler source stamp mismatch',
  )
  const pnpm = pnpmVersion(repo, tool)
  assert.equal(readFileSync(join(repo, '.nvmrc'), 'utf8').trim(), '26')
  return {
    textDist: fileTree(join(repo, 'packages/text/dist')),
    commit: git(repo, 'rev-parse', 'HEAD'),
    tree: git(repo, 'rev-parse', 'HEAD^{tree}'),
    originMain: git(repo, 'rev-parse', 'origin/main'),
    node: process.version,
    pnpm,
    host: {
      name: hostname(),
      platform: platform(),
      arch: arch(),
      release: release(),
      cpu: cpus()[0].model,
      cores: cpus().length,
      memoryBytes: totalmem(),
    },
    compiler: {
      file: relative(repo, compiler.file),
      stamp,
      sha256: hash(readFileSync(compiler.file)),
    },
    files: Object.fromEntries(files.map((file) => [file, hash(readFileSync(join(repo, file)))])),
  }
}

function fileTree(folder) {
  const root = lstatSync(folder)
  assert.ok(root.isDirectory() && !root.isSymbolicLink(), 'Expected regular build directory')
  const files = readdirSync(folder, { recursive: true }).sort((left, right) =>
    left.localeCompare(right),
  )
  assert.ok(files.length < 10000, 'Unbounded asset count')
  let bytes = 0
  const entries = []
  for (const file of files) {
    const path = join(folder, file),
      stat = lstatSync(path)
    assert.ok(!stat.isSymbolicLink(), 'Symlinked build output')
    if (!stat.isFile()) continue
    bytes += stat.size
    assert.ok(bytes < 128 * 1024 ** 2, 'Oversized build output')
    entries.push([file, { bytes: stat.size, sha256: hash(readFileSync(path)) }])
  }
  return Object.fromEntries(entries)
}

/** Hash all outputs, rejecting missing dashboards instead of rebuilding them silently. */
export function assetPins(repo, stacks) {
  return Object.fromEntries(
    stacks.map(({ name }) => {
      const dist = join(repo, 'benchmarks/compare', name, 'dist')
      assert.ok(existsSync(join(dist, 'index.html')), `Missing built dashboard: ${name}`)
      const files = fileTree(dist)
      assert.ok(
        Object.keys(files).some((file) => file.endsWith('.js')),
        `Missing JS assets: ${name}`,
      )
      return [name, files]
    }),
  )
}

/** Bind successful build commands and assets to immutable source/install pins. */
export function verifyBuild(proof, pins, assets) {
  requireSix(Object.keys(assets))
  assert.equal(proof.kind, 'profile-load-build-v1', 'Missing manager build receipt')
  assert.deepEqual(proof.pins, pins, 'Build source/dependency/compiler mismatch')
  assert.deepEqual(proof.assets, assets, 'Prebuilt asset mismatch')
  assert.equal(proof.commands.length, 6)
  assert.deepEqual(
    proof.commands.map((row) => row.stack).sort((left, right) => left.localeCompare(right)),
    Object.keys(assets).sort((left, right) => left.localeCompare(right)),
    'Build command stack coverage mismatch',
  )
  assert.ok(
    proof.commands.every((row) => row.exit === 0 && row.signal === null),
    'Failed build receipt',
  )
}
