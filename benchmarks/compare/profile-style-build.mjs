#!/usr/bin/env node
// M4-only hidden-map reproduction of the archived build; mismatches prohibit attribution.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { discoverStacks } from './profile-load-data.mjs'
import { sourcePins, assetPins, managerRoot, resources, verifyBuild } from './profile-load-pins.mjs'
import { evidence, withLease } from './profile-load-io.mjs'
import { analyze, options } from './profile-style.mjs'

async function hiddenBuild(repo, name, log, root, signal) {
  resources(root, 512 * 1024 ** 2)
  const args = ['exec', 'vite', 'build', '--sourcemap', 'hidden', '--logLevel', 'error']
  const child = spawn('pnpm', args, {
    cwd: join(repo, 'benchmarks/compare', name),
    detached: true,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: process.env,
  })
  let problem
  const kill = () => {
    if (!child.pid) return
    try {
      process.kill(-child.pid, 'SIGKILL')
    } catch (error) {
      if (error.code !== 'ESRCH') problem ??= error
    }
  }
  const data = (chunk) => {
    try {
      log.append(name + '.log', chunk)
    } catch (error) {
      problem = error
      kill()
    }
  }
  child.stdout.on('data', data)
  child.stderr.on('data', data)
  child.once('exit', kill)
  signal.addEventListener('abort', kill)
  if (signal.aborted) kill()
  const timer = setInterval(() => {
    try {
      resources(root)
    } catch (error) {
      problem = error
      kill()
    }
  }, 1000)
  const deadline = setTimeout(() => {
    problem = new Error('Hidden build timeout')
    kill()
  }, 240000)
  try {
    const result = await new Promise((ok, bad) => {
      child.once('error', bad)
      child.once('close', (exit, received) => ok({ stack: name, args, exit, signal: received }))
    })
    log.json(name + '-exit.json', { ...result, error: problem ? String(problem) : null })
    assert.ok(!problem && result.exit === 0 && result.signal === null, `Failed build: ${name}`)
    return result
  } finally {
    clearInterval(timer)
    clearTimeout(deadline)
    signal.removeEventListener('abort', kill)
    kill()
  }
}

function comparePins(actual, expected) {
  for (const key of ['commit', 'tree', 'node', 'pnpm', 'compiler', 'files', 'textDist'])
    assert.deepEqual(actual[key], expected[key], `Archived source/install mismatch: ${key}`)
}

/** Retain only the small witnessed outputs in memory and restore them even after a failed build. */
export async function preservingAssets(repo, stacks, expected, task) {
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

/** Build all six once on the exact archived source; never install, fetch or alter source. */
export async function reproduce(args) {
  process.env.WEFT_COMPILER = 'native'
  const root = managerRoot(args.repo, args.out)
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
      const stacks = discoverStacks(args.repo),
        before = sourcePins(args.repo, stacks)
      comparePins(before, captured.pins)
      log.json('pins-before.json', before)
      const originalAssets = assetPins(args.repo, stacks)
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

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url))
  console.log(await reproduce(options(process.argv.slice(2))))
