// Exercise the cached pnpm12 parser and effective policy without installing dependencies.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { execFileSync, spawnSync } from 'node:child_process'
import {
  mkdtempSync,
  mkdirSync,
  copyFileSync,
  writeFileSync,
  readFileSync,
  rmSync,
  existsSync,
} from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  cachedPnpmEntry,
  reconstructionEnv,
  pnpmArgs,
  checkoutSource,
} from './profile-style-setup.mjs'
import { digest } from './profile-style-maps.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))

function invoke(entry, args, cwd, env) {
  const clean = { ...env }
  delete clean.NODE_TEST_CONTEXT
  return spawnSync(entry, args, {
    cwd,
    env: clean,
    encoding: 'utf8',
    timeout: 10000,
    maxBuffer: 1024 * 1024,
  })
}

test('real cached pnpm12 parses exact install options and reports false/4320 before any install', () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-pnpm-parser-')),
    env = reconstructionEnv(root)
  const entry = cachedPnpmEntry(env.COREPACK_HOME)
  try {
    assert.equal(invoke(entry, ['--version'], repo, env).stdout.trim(), '12.15.0')
    // The shim must also find its existing cache after XDG_CACHE_HOME changes, with no download.
    assert.equal(invoke('pnpm', ['--version'], repo, env).stdout.trim(), '12.15.0')
    for (const workspace of ['', 'benchmarks/compare']) {
      const cwd = join(root, workspace)
      mkdirSync(cwd, { recursive: true })
      copyFileSync(join(repo, workspace, 'pnpm-workspace.yaml'), join(cwd, 'pnpm-workspace.yaml'))
      writeFileSync(join(cwd, 'package.json'), '{"private":true,"packageManager":"pnpm@12.15.0"}')
      const before = readFileSync(join(cwd, 'pnpm-workspace.yaml'))
      for (const [key, expected] of [
        ['enableGlobalVirtualStore', 'false'],
        ['minimumReleaseAge', '4320'],
        ['storeDir', join(root, 'store')],
        ['cacheDir', join(root, 'cache')],
        ['packageImportMethod', 'hardlink'],
      ]) {
        const result = invoke(entry, pnpmArgs(root, ['config', 'get', key]), cwd, env)
        assert.equal(result.status, 0, result.stderr)
        assert.equal(result.stdout.trim(), expected)
      }
      const install = invoke(
        entry,
        pnpmArgs(root, [
          'install',
          '--frozen-lockfile',
          '--ignore-scripts',
          '--verify-store-integrity=true',
          '--help',
        ]),
        cwd,
        env,
      )
      assert.equal(install.status, 0, install.stderr)
      assert.match(install.stdout, /Usage: pnpm install/)
      assert.equal(invoke(entry, pnpmArgs(root, ['store', 'status', '--help']), cwd, env).status, 0)
      for (const rejected of [
        ['--enable-global-virtual-store=false'],
        ['--cache-dir', '/unused'],
      ]) {
        const bad = invoke(entry, ['install', ...rejected, '--help'], cwd, env)
        assert.equal(bad.status, 2)
        assert.match(bad.stderr, /unexpected argument/)
      }
      assert.deepEqual(readFileSync(join(cwd, 'pnpm-workspace.yaml')), before)
      assert.equal(existsSync(join(cwd, 'node_modules')), false)
      assert.equal(existsSync(join(cwd, 'pnpm-lock.yaml')), false)
    }
    assert.equal(existsSync(join(root, 'store')), false)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})

test('missing pnpm cache fails; an explicit existing cache survives reconstruction isolation', () => {
  assert.throws(() => cachedPnpmEntry(join(tmpdir(), 'weft-pnpm-missing-cache')), /ENOENT/)
  const env = reconstructionEnv('/owned', { COREPACK_HOME: '/existing/cache' })
  assert.equal(env.COREPACK_HOME, '/existing/cache')
  assert.equal(env.COREPACK_ENABLE_NETWORK, '0')
})

test('real local main/source bundles bootstrap exact Git without a remote URL or authentication', async () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-bundle-bootstrap-')),
    source = join(root, 'source')
  const git = (...args) => execFileSync('git', args, { cwd: source, encoding: 'utf8' }).trim()
  try {
    mkdirSync(source)
    git('init', '-qb', 'main')
    writeFileSync(join(source, 'package.json'), '{"private":true}\n')
    git('add', '.')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Source')
    const commit = git('rev-parse', 'HEAD'),
      tree = git('rev-parse', 'HEAD^{tree}')
    git('update-ref', 'refs/t02-captured-source', commit)
    const main = join(root, 'main.bundle'),
      captured = join(root, 'captured.bundle')
    git('bundle', 'create', main, 'main')
    git('bundle', 'create', captured, 'refs/t02-captured-source')
    const args = { repo: join(root, 'repo'), 'main-bundle': main, 'source-bundle': captured }
    const commands = []
    const run = (cwd, name, command, values) => {
      assert.equal(command, 'git')
      commands.push({ name, values })
      const stdout = execFileSync(command, values, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      })
      return Promise.resolve({ stdout })
    }
    await checkoutSource(
      args,
      {
        commit,
        tree,
        files: {
          'package.json': digest(readFileSync(join(source, 'package.json'))),
        },
      },
      root,
      run,
    )
    assert.ok(commands.some((c) => c.name === 'verify-main-bundle'))
    assert.ok(commands.some((c) => c.name === 'verify-source-bundle'))
    assert.ok(commands.every((c) => c.values.every((value) => !/^https?:/.test(value))))
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
