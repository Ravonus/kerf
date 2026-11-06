// Recreate only this manager lease from captured Git and frozen locks; never copy dependency caches.
import assert from 'node:assert/strict'
import { existsSync, mkdirSync, readFileSync, writeFileSync, realpathSync } from 'node:fs'
import { arch, homedir, platform } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { digest } from './profile-style-maps.mjs'
import { resources } from './profile-load-pins.mjs'
import { runStep } from './profile-style-process.mjs'
import { dependencyGraph, verifyGraph } from './profile-style-environment.mjs'

/** Refuse accidental reuse of a surviving checkout before a reconstructed install. */
export function reconstructionRoot(args) {
  const root = join(homedir(), 'work/weft-S5-perf')
  assert.equal(resolve(args.repo), join(root, 'repo'))
  assert.equal(dirname(resolve(args.out)), root)
  assert.ok(
    args.native && args['native-stamp'] && args['source-url'],
    'Missing reconstruction inputs',
  )
  assert.equal(platform(), 'darwin')
  assert.equal(arch(), 'arm64')
  assert.equal(process.version, 'v26.13.0')
  assert.equal(
    realpathSync(process.execPath),
    realpathSync(join(homedir(), 'work/toolchain/node-v26.13.0-darwin-arm64/bin/node')),
  )
  mkdirSync(root, { recursive: true })
  assert.equal(realpathSync(root), root, 'Symlinked reconstruction root')
  assert.ok(!existsSync(args.repo), 'Reconstruction requires an absent owned repo path')
  resources(root, 512 * 1024 ** 2)
  return root
}

/** Ignore inherited package-manager override variables; exact workspace policy stays authoritative. */
export function reconstructionEnv(root, inherited = process.env) {
  const env = Object.fromEntries(
    Object.entries(inherited).filter(([key]) => !/^(?:npm_config_|pnpm_)/i.test(key)),
  )
  return {
    ...env,
    WEFT_COMPILER: 'native',
    COREPACK_ENABLE_NETWORK: '0',
    CI: '1',
    XDG_CACHE_HOME: join(root, 'cache'),
    XDG_STATE_HOME: join(root, 'state'),
  }
}

function copyCompiler(args, captured) {
  const bytes = readFileSync(args.native),
    stamp = readFileSync(args['native-stamp'])
  assert.ok(bytes.length < 64 * 1024 ** 2, 'Oversized native artifact')
  assert.equal(digest(bytes), captured.compiler.sha256, 'Native artifact hash mismatch')
  assert.equal(stamp.toString().trim(), captured.compiler.stamp, 'Native artifact source mismatch')
  const file = join(args.repo, captured.compiler.file)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, bytes)
  writeFileSync(file + '.stamp', stamp)
  return { sha256: digest(bytes), stamp: captured.compiler.stamp }
}

async function graphProof(cwd, name, repo, run, log) {
  const args = ['list', '--recursive', '--include-workspace-root', '--depth', 'Infinity', '--json']
  const installed = dependencyGraph(
    JSON.parse((await run(cwd, name + '-installed', 'pnpm', args, true)).stdout),
    repo,
  )
  const locked = dependencyGraph(
    JSON.parse(
      (await run(cwd, name + '-locked', 'pnpm', [...args, '--lockfile-only'], true)).stdout,
    ),
    repo,
  )
  const proof = verifyGraph(installed, locked)
  log.json(name + '-graph.json', { ...proof, installed, locked })
  return proof
}

async function checkoutSource(args, captured, root, run) {
  await run(root, 'clone', 'git', [
    'clone',
    '--filter=blob:none',
    '--no-checkout',
    args['source-url'],
    args.repo,
  ])
  if (args['source-bundle']) {
    await run(args.repo, 'verify-source-bundle', 'git', ['bundle', 'verify', args['source-bundle']])
    await run(args.repo, 'fetch-source', 'git', [
      'fetch',
      args['source-bundle'],
      'refs/t02-captured-source',
    ])
  } else await run(args.repo, 'fetch-source', 'git', ['fetch', 'origin', captured.commit])
  await run(args.repo, 'checkout-source', 'git', ['checkout', '--detach', captured.commit])
  await run(args.repo, 'origin-main', 'git', ['rev-parse', '--verify', 'origin/main^{commit}'])
  const identity = (
    await run(args.repo, 'source-identity', 'git', ['rev-parse', 'HEAD', 'HEAD^{tree}'], true)
  ).stdout
    .trim()
    .split('\n')
  assert.deepEqual(identity, [captured.commit, captured.tree], 'Captured Git source mismatch')
  for (const [file, expected] of Object.entries(captured.files))
    if (!file.includes('node_modules/'))
      assert.equal(
        digest(readFileSync(join(args.repo, file))),
        expected,
        `Frozen input mismatch: ${file}`,
      )
}

/** Frozen installs and store verification establish fresh evidence; archived metadata is untouched. */
export async function prepareReconstruction(args, captured, log, root, signal, runner = runStep) {
  const env = reconstructionEnv(root),
    commands = []
  const run = async (cwd, name, command, values, collect = false) => {
    const result = await runner(
      { cwd, name, command, args: values, collect, env, timeoutMs: 900000 },
      log,
      root,
      signal,
    )
    const { stdout: _stdout, ...receipt } = result
    commands.push(receipt)
    return result
  }
  await checkoutSource(args, captured, root, run)
  const artifact = copyCompiler(args, captured)
  assert.equal(
    (await run(args.repo, 'pnpm-version', 'pnpm', ['--version'], true)).stdout.trim(),
    captured.pnpm,
    'Wrong reconstructed pnpm version',
  )
  const graphs = []
  for (const [name, cwd] of [
    ['root', args.repo],
    ['compare', join(args.repo, 'benchmarks/compare')],
  ]) {
    const policy = await run(
      cwd,
      name + '-policy',
      'pnpm',
      ['config', 'get', 'minimumReleaseAge'],
      true,
    )
    assert.equal(policy.stdout.trim(), '4320', 'Release-age policy changed')
    await run(cwd, name + '-install', 'pnpm', [
      'install',
      '--frozen-lockfile',
      '--ignore-scripts',
      '--verify-store-integrity=true',
      '--enable-global-virtual-store=false',
      '--package-import-method=hardlink',
      '--store-dir',
      join(root, 'store'),
      '--cache-dir',
      join(root, 'cache'),
    ])
    await run(cwd, name + '-content', 'pnpm', [
      'store',
      'status',
      '--store-dir',
      join(root, 'store'),
    ])
    graphs.push(await graphProof(cwd, name, args.repo, run, log))
  }
  await run(args.repo, 'text-build', 'pnpm', ['--filter', '@weft-js/text', 'run', 'build'])
  const result = {
    kind: 'explicit reconstruction; not original timing environment',
    commands,
    artifact,
    graphs,
    originalContentManifest: null,
  }
  log.json('reconstruction.json', result)
  return result
}
