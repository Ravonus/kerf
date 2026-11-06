// Fresh-install metadata may differ, but locked content, source and asset checks remain binding.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compareEnvironment, dependencyGraph, verifyGraph } from './profile-style-environment.mjs'
import { reconstructionEnv, prepareReconstruction, pnpmArgs } from './profile-style-setup.mjs'
import { digest } from './profile-style-maps.mjs'
import { runStep } from './profile-style-process.mjs'
import { buildOptions, preservingAssets } from './profile-style-build.mjs'
import { STACKS } from './profile-load-data.mjs'

const original = {
  commit: 'captured',
  tree: 'tree',
  node: 'v26.13.0',
  pnpm: '12.15.0',
  compiler: { stamp: 'source', sha256: 'binary' },
  files: {
    'pnpm-lock.yaml': 'frozen',
    'node_modules/.modules.yaml': 'old-timestamp',
    'node_modules/.pnpm/lock.yaml': 'old-serialization',
  },
  textDist: { 'engine.js': { bytes: 1, sha256: 'text' } },
  host: { cpu: 'original' },
}

test('reconstruction records metadata/text differences without changing archived pins', () => {
  const before = JSON.stringify(original),
    rebuilt = structuredClone(original)
  rebuilt.files['node_modules/.modules.yaml'] = 'new-timestamp'
  rebuilt.files['node_modules/.pnpm/lock.yaml'] = 'new-serialization'
  rebuilt.textDist['engine.js'].sha256 = 'new-text'
  const report = compareEnvironment(rebuilt, original, true)
  assert.equal(report.metadata.filter((row) => !row.equal).length, 2)
  assert.equal(report.text.equal, false)
  assert.equal(report.originalDependencyContentManifest, null)
  assert.equal(JSON.stringify(original), before)
  assert.throws(() => compareEnvironment(rebuilt, original), /Archived input mismatch/)
  rebuilt.files['pnpm-lock.yaml'] = 'changed-lock'
  assert.throws(() => compareEnvironment(rebuilt, original, true), /Archived input mismatch/)
  rebuilt.files['pnpm-lock.yaml'] = 'frozen'
  rebuilt.compiler.stamp = 'wrong-source'
  assert.throws(() => compareEnvironment(rebuilt, original, true), /toolchain mismatch/)
})

test('installed graph matches frozen versions and peer slots; missing optional edges are explicit', () => {
  const root = '/owned/repo',
    child = (version, slot) => ({ version, path: root + '/node_modules/.pnpm/' + slot })
  const graph = [
    {
      path: root,
      dependencies: { a: child('1.0.0', 'a@1') },
      optionalDependencies: { optional: child('2.0.0', 'optional@2') },
    },
  ]
  const locked = dependencyGraph(graph, root)
  const installed = dependencyGraph([{ path: root, dependencies: graph[0].dependencies }], root)
  assert.equal(verifyGraph(installed, locked).absentOptional.length, 1)
  const bad = structuredClone(installed)
  bad[0].path = 'wrong-peer-slot'
  assert.throws(() => verifyGraph(bad, locked), /Installed graph differs/)
  bad[0] = { ...installed[0], version: '1.0.1' }
  assert.throws(() => verifyGraph(bad, locked), /Installed graph differs/)
  assert.throws(
    () =>
      verifyGraph(
        locked.filter((row) => row.optional),
        locked,
      ),
    /Missing required/,
  )
  assert.throws(
    () => dependencyGraph([{ path: root, dependencies: { bad: {} } }], root),
    /Malformed/,
  )
})

test('clean setup removes inherited policy overrides and requires explicit reconstruction arguments', () => {
  const env = reconstructionEnv('/owned', {
    PATH: '/tools',
    HOME: '/home',
    npm_config_minimumReleaseAge: '0',
    NPM_CONFIG_VERIFY_STORE_INTEGRITY: 'false',
    PNPM_HOME: '/elsewhere',
  })
  assert.equal(env.npm_config_minimumReleaseAge, undefined)
  assert.equal(env.NPM_CONFIG_VERIFY_STORE_INTEGRITY, undefined)
  assert.equal(env.PNPM_HOME, undefined)
  assert.equal(env.COREPACK_ENABLE_NETWORK, '0')
  const args = buildOptions([
    '--repo',
    '/repo',
    '--receipt',
    '/receipt',
    '--out',
    '/out',
    '--reconstruct',
    '--source-url',
    'https://example.invalid/repo.git',
    '--native',
    '/native',
    '--native-stamp',
    '/native.stamp',
  ])
  assert.equal(args.reconstruct, true)
  assert.equal(args['source-url'], 'https://example.invalid/repo.git')
  assert.throws(() => buildOptions(['--native', '--out']), /Missing setup value/)
})

test('empty reconstructed outputs restore absence after a failed mapping', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'weft-style-empty-'))
  const dist = join(repo, 'benchmarks/compare/weft-warp/dist')
  try {
    await assert.rejects(
      preservingAssets(
        repo,
        STACKS.map((name) => ({ name })),
        null,
        () => {
          mkdirSync(dist, { recursive: true })
          writeFileSync(join(dist, 'wrong.js'), 'wrong')
          throw new Error('Planted reconstruction failure')
        },
      ),
      /Planted reconstruction failure/,
    )
    assert.equal(existsSync(dist), false)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})

test('manager steps preserve full logs and nonzero exits; content-check failure cannot pass', async () => {
  const logs = new Map(),
    receipts = new Map(),
    controller = new AbortController()
  const log = {
    append: (name, bytes) => logs.set(name, (logs.get(name) ?? '') + bytes),
    json: (name, value) => receipts.set(name, value),
  }
  const step = {
    cwd: tmpdir(),
    name: 'content',
    command: process.execPath,
    collect: true,
    args: ['-e', 'console.log("verified")'],
    timeoutMs: 1000,
  }
  const good = await runStep(step, log, tmpdir(), controller.signal, () => {})
  assert.equal(good.stdout, 'verified\n')
  await assert.rejects(
    runStep(
      {
        ...step,
        args: ['-e', 'console.error("ERR_PNPM_MODIFIED_DEPENDENCY"); process.exitCode=7'],
      },
      log,
      tmpdir(),
      controller.signal,
      () => {},
    ),
    /Failed manager step/,
  )
  assert.equal(receipts.get('content-exit.json').exit, 7)
  assert.match(logs.get('content.log'), /ERR_PNPM_MODIFIED_DEPENDENCY/)
})

function assertSetupSteps(steps, root, args, receipts) {
  assert.equal(steps.filter((s) => s.name.endsWith('-install')).length, 2)
  for (const step of steps.filter((s) => s.name.endsWith('-install'))) {
    assert.ok(step.args.includes('--frozen-lockfile'))
    assert.ok(step.args.includes('--verify-store-integrity=true'))
    assert.ok(step.args.includes('--ignore-scripts'))
  }
  assert.equal(steps.filter((s) => s.name.endsWith('-content')).length, 2)
  assert.deepEqual(steps.at(-1).args, pnpmArgs(root, ['--filter', '@weft-js/text', 'run', 'build']))
  assert.ok(steps.some((step) => step.name === 'verify-main-bundle'))
  assert.ok(steps.find((step) => step.name === 'clone').args.includes(args['main-bundle']))
  assert.ok(steps.some((step) => step.name === 'verify-source-bundle'))
  assert.deepEqual(steps.find((step) => step.name === 'fetch-source').args, [
    'fetch',
    args['source-bundle'],
    'refs/t02-captured-source',
  ])
  assert.equal(receipts.get('reconstruction.json').graphs.length, 2)
}

test('mocked fresh checkout installs both frozen workspaces, verifies content and rebuilds text', async () => {
  const root = mkdtempSync(join(tmpdir(), 'weft-style-setup-')),
    repo = join(root, 'repo')
  const bytes = Buffer.from('verified native'),
    stamp = join(root, 'native.stamp')
  const native = join(root, 'native'),
    lock = Buffer.from('captured frozen lock')
  writeFileSync(native, bytes)
  writeFileSync(stamp, 'source\n')
  const captured = {
    ...original,
    compiler: {
      file: 'packages/core/native/compiler.node',
      sha256: digest(bytes),
      stamp: 'source',
    },
    files: { 'pnpm-lock.yaml': digest(lock) },
  }
  const steps = [],
    receipts = new Map(),
    log = { json: (name, data) => receipts.set(name, data) }
  const runner = (step) => {
    steps.push(step)
    if (step.name === 'clone') {
      mkdirSync(repo)
      writeFileSync(join(repo, 'pnpm-lock.yaml'), lock)
    }
    let stdout = ''
    if (step.name === 'source-identity') stdout = 'captured\ntree\n'
    if (step.name === 'pnpm-version') stdout = '12.15.0\n'
    if (step.name.includes('-policy-')) {
      const settings = {
        enableGlobalVirtualStore: 'false',
        minimumReleaseAge: '4320',
        cacheDir: join(root, 'cache'),
        storeDir: join(root, 'store'),
        packageImportMethod: 'hardlink',
      }
      stdout = settings[step.args.at(-1)] + '\n'
    }
    if (step.name.endsWith('-installed') || step.name.endsWith('-locked'))
      stdout = JSON.stringify([
        {
          path: step.cwd,
          dependencies: { dep: { version: '1.0.0', path: join(repo, 'node_modules/dep') } },
        },
      ])
    return Promise.resolve({ name: step.name, args: step.args, exit: 0, signal: null, stdout })
  }
  const args = {
    repo,
    native,
    'native-stamp': stamp,
    'main-bundle': join(root, 'bootstrap.bundle'),
    'source-bundle': join(root, 'captured.bundle'),
  }
  try {
    await prepareReconstruction(
      args,
      captured,
      log,
      root,
      new AbortController().signal,
      runner,
      () => 'pnpm',
    )
    assertSetupSteps(steps, root, args, receipts)
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
