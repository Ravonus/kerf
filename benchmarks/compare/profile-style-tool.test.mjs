// Real child processes prove executable, environment and cwd selection without installing or building.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, delimiter } from 'node:path'
import { execFileSync, spawnSync } from 'node:child_process'
import { cachedPnpmEntry, reconstructionEnv, pnpmArgs } from './profile-style-setup.mjs'
import { pnpmVersion } from './profile-load-pins.mjs'
import { hiddenBuild } from './profile-style-build.mjs'

async function fixture(task) {
  const root = realpathSync(mkdtempSync(join(tmpdir(), 'weft-pnpm-selection-'))),
    repo = join(root, 'repo'),
    launcher = join(root, 'launcher')
  mkdirSync(repo)
  mkdirSync(launcher)
  writeFileSync(join(repo, 'package.json'), '{"packageManager":"pnpm@12.15.0"}')
  const executable = (name, body) => {
    const path = join(launcher, name)
    writeFileSync(path, '#!' + process.execPath + '\n' + body + '\n', { mode: 0o755 })
    return path
  }
  const wrong = executable('pnpm', 'console.log("12.16.1")')
  const env = reconstructionEnv(root)
  env.PATH = launcher + delimiter + env.PATH
  delete env.NODE_TEST_CONTEXT
  const entry = cachedPnpmEntry(env.COREPACK_HOME)
  try {
    await task({ root, repo, launcher, executable, wrong, env, entry })
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('mismatched launcher cannot replace the actual selected cached pnpm', () =>
  fixture(({ repo, launcher, env, entry, wrong }) => {
    assert.equal(
      execFileSync('pnpm', ['--version'], { cwd: launcher, env, encoding: 'utf8' }).trim(),
      '12.16.1',
    )
    const driver = join(launcher, 'query.mjs')
    const pinsUrl = new URL('./profile-load-pins.mjs', import.meta.url).href
    writeFileSync(
      driver,
      `import {pnpmVersion} from ${JSON.stringify(pinsUrl)};
console.log(pnpmVersion(process.argv[2], {command:process.argv[3],env:process.env}));`,
    )
    const run = (command) =>
      spawnSync(process.execPath, [driver, repo, command], {
        cwd: launcher,
        env,
        encoding: 'utf8',
        timeout: 10000,
      })
    const selected = run(entry)
    assert.equal(selected.status, 0, selected.stderr)
    assert.equal(selected.stdout.trim(), '12.15.0')
    for (const bad of [wrong, process.execPath]) {
      const rejected = run(bad)
      assert.equal(rejected.status, 1)
      assert.match(rejected.stderr, /Selected pnpm version mismatch/)
    }
  }))

test('version query passes the exact repo cwd and selected environment to its child', () =>
  fixture(({ repo, env, executable }) => {
    const command = executable(
      'cwd-probe',
      `if(process.cwd()!==${JSON.stringify(repo)} || process.env.T02_SELECTED!=='yes')
throw Error('Wrong tool context'); console.log('12.15.0')`,
    )
    const selected = { ...env, T02_SELECTED: 'yes' }
    assert.equal(pnpmVersion(repo, { command, env: selected }), '12.15.0')
    assert.throws(() => pnpmVersion(repo, { command, env }), /Wrong tool context/)
  }))

test('hidden build receives the same selected binary and environment as its pins', () =>
  fixture(async ({ repo, root, env, entry }) => {
    const cwd = join(repo, 'benchmarks/compare/weft-warp')
    mkdirSync(cwd, { recursive: true })
    const tool = { command: entry, env },
      expected = pnpmVersion(repo, tool)
    let calls = 0
    const signal = new AbortController().signal
    const runner = (step, _log, owned, actualSignal) => {
      calls++
      assert.equal(owned, root)
      assert.equal(actualSignal, signal)
      assert.equal(step.cwd, cwd)
      assert.equal(step.command, tool.command)
      assert.equal(step.env, tool.env)
      assert.deepEqual(
        step.args,
        pnpmArgs(root, ['exec', 'vite', 'build', '--sourcemap', 'hidden', '--logLevel', 'error']),
      )
      const version = execFileSync(step.command, ['--version'], {
        cwd: step.cwd,
        env: step.env,
        encoding: 'utf8',
      }).trim()
      assert.equal(version, expected)
      return Promise.resolve({ name: step.name, exit: 0, signal: null, stdout: '' })
    }
    const receipt = await hiddenBuild(repo, 'weft-warp', {}, root, signal, tool, runner)
    assert.equal(calls, 1)
    assert.equal(receipt.exit, 0)
  }))
