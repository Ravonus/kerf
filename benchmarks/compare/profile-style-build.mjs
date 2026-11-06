#!/usr/bin/env node
// M4-only hidden-map reproduction of the archived build; mismatches prohibit attribution.
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync, mkdirSync, rmSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverStacks } from './profile-load-data.mjs'
import { sourcePins, assetPins, managerRoot, verifyBuild } from './profile-load-pins.mjs'
import { evidence, withLease } from './profile-load-io.mjs'
import { analyze, options } from './profile-style.mjs'
import { runStep } from './profile-style-process.mjs'
import { compareEnvironment } from './profile-style-environment.mjs'
import {
  reconstructionRoot,
  reconstructionEnv,
  prepareReconstruction,
  pnpmArgs,
  cachedPnpmEntry,
} from './profile-style-setup.mjs'

async function hiddenBuild(repo, name, log, root, signal) {
  const result = await runStep(
    {
      cwd: join(repo, 'benchmarks/compare', name),
      name,
      command: cachedPnpmEntry(reconstructionEnv(root).COREPACK_HOME),
      args: pnpmArgs(root, [
        'exec',
        'vite',
        'build',
        '--sourcemap',
        'hidden',
        '--logLevel',
        'error',
      ]),
      env: reconstructionEnv(root),
    },
    log,
    root,
    signal,
  )
  const { stdout: _stdout, ...receipt } = result
  return receipt
}

/** A fresh reconstruction has no previous dist; remove only the outputs this pass creates. */
async function preservingEmpty(repo, stacks, task) {
  const folders = stacks.map(({ name }) => join(repo, 'benchmarks/compare', name, 'dist'))
  assert.ok(
    folders.every((folder) => !existsSync(folder)),
    'Unexpected reconstructed dist',
  )
  try {
    return await task()
  } finally {
    for (const folder of folders) rmSync(folder, { recursive: true, force: true })
  }
}

/** Retain only the small witnessed outputs in memory and restore them even after a failed build. */
export async function preservingAssets(repo, stacks, expected, task) {
  if (expected === null) return preservingEmpty(repo, stacks, task)
  assert.deepEqual(assetPins(repo, stacks), expected, 'Original asset witness mismatch')
  const saved = []
  let bytes = 0
  for (const [stack, files] of Object.entries(expected)) {
    const dist = join(repo, 'benchmarks/compare', stack, 'dist'),
      entries = []
    for (const file of Object.keys(files)) {
      const data = readFileSync(join(dist, file))
      bytes += data.length
      assert.ok(bytes < 16 * 1024 ** 2, 'Original assets exceed 16 MiB restoration cap')
      entries.push([file, data])
    }
    saved.push({ dist, entries })
  }
  try {
    return await task()
  } finally {
    for (const { dist, entries } of saved) {
      rmSync(dist, { recursive: true, force: true })
      for (const [file, data] of entries) {
        mkdirSync(dirname(join(dist, file)), { recursive: true })
        writeFileSync(join(dist, file), data)
      }
    }
    assert.deepEqual(assetPins(repo, stacks), expected, 'Original asset restoration failed')
  }
}

async function attribute(args, stacks, captured, log, root, signal) {
  const commands = []
  for (const { name } of stacks) {
    signal.throwIfAborted()
    commands.push(await hiddenBuild(args.repo, name, log, root, signal))
  }
  const analysis = analyze(args.repo, args.receipt, true)
  assert.ok(
    Buffer.byteLength(JSON.stringify(analysis)) < 16 * 1024 ** 2,
    'Mapped analysis exceeds 16 MiB',
  )
  log.json('mapped-analysis.json', analysis)
  log.json('proof.json', {
    source: captured.pins.commit,
    commands,
    mapped: true,
    coverage: analysis.coverage,
    mapProofs: analysis.mapProofs,
  })
  return analysis.coverage
}

/** Retained builds require original pins; explicit reconstruction records a new environment. */
export async function reproduce(args) {
  process.env.WEFT_COMPILER = 'native'
  process.env.COREPACK_ENABLE_NETWORK = '0'
  if (args['corepack-home']) process.env.COREPACK_HOME = args['corepack-home']
  const root = args.reconstruct ? reconstructionRoot(args) : managerRoot(args.repo, args.out)
  return withLease(root, async () => {
    const log = evidence(args.out),
      controller = new AbortController()
    const abort = () => controller.abort()
    process.on('SIGINT', abort)
    process.on('SIGTERM', abort)
    try {
      const captured = JSON.parse(readFileSync(join(args.receipt, 'pins.json')))
      const proof = JSON.parse(
        readFileSync(join(args.receipt, '..', 'build-' + captured.pins.commit, 'build-proof.json')),
      )
      verifyBuild(proof, captured.pins, captured.assets)
      if (args.reconstruct) {
        await prepareReconstruction(args, captured.pins, log, root, controller.signal)
        managerRoot(args.repo, args.out)
      }
      const stacks = discoverStacks(args.repo),
        before = sourcePins(args.repo, stacks)
      const environment = compareEnvironment(before, captured.pins, args.reconstruct)
      log.json('environment-comparison.json', environment)
      log.json('pins-before.json', before)
      const originalAssets = args.reconstruct ? null : assetPins(args.repo, stacks)
      log.json('assets-before.json', originalAssets)
      const coverage = await preservingAssets(args.repo, stacks, originalAssets, () =>
        attribute(args, stacks, captured, log, root, controller.signal),
      )
      assert.deepEqual(sourcePins(args.repo, stacks), before, 'Build changed source/install')
      log.json('restored.json', { assets: true, source: true })
      return coverage
    } catch (error) {
      log.json('failure.json', { error: String(error) })
      throw error
    } finally {
      process.off('SIGINT', abort)
      process.off('SIGTERM', abort)
    }
  })
}

/** Reconstruction is opt-in, with explicit source and compiler artifact inputs. */
export function buildOptions(values) {
  const extra = {},
    rest = []
  for (let index = 0; index < values.length; index++) {
    const key = values[index]
    if (key === '--reconstruct') extra.reconstruct = true
    else if (
      [
        '--native',
        '--native-stamp',
        '--source-url',
        '--source-bundle',
        '--main-bundle',
        '--corepack-home',
      ].includes(key)
    ) {
      assert.ok(values[index + 1] && !values[index + 1].startsWith('--'), 'Missing setup value')
      extra[key.slice(2)] = key === '--source-url' ? values[++index] : resolve(values[++index])
    } else rest.push(key)
  }
  return { ...options(rest), ...extra }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(await reproduce(buildOptions(process.argv.slice(2))))
