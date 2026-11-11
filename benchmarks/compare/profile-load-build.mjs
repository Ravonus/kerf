#!/usr/bin/env node
// M4 witnesses successful ordinary six-stack builds before the read-only profile pass.
import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { options } from './profile-load.mjs'
import { discoverStacks } from './profile-load-data.mjs'
import { sourcePins, assetPins, managerRoot, resources } from './profile-load-pins.mjs'
import { withLease, evidence } from './profile-load-io.mjs'

async function buildOne(repo, name, log, root, signal) {
  resources(root)
  const child = spawn('pnpm', ['exec', 'vite', 'build', '--logLevel', 'error'], {
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
  try {
    const result = await new Promise((ok, bad) => {
      child.once('error', bad)
      child.once('close', (exit, received) => ok({ stack: name, exit, signal: received }))
    })
    log.json(name + '-exit.json', { ...result, error: problem ? String(problem) : null })
    assert.ok(!problem && result.exit === 0 && result.signal === null, `Failed build: ${name}`)
    return result
  } finally {
    clearInterval(timer)
    signal.removeEventListener('abort', kill)
    kill()
  }
}

/** Existing installs/text/compiler must already match; no install, native rebuild or canonical measure. */
export async function buildProof(repo, args) {
  process.env.KERF_COMPILER = 'native'
  assert.ok(!args['build-proof'], 'Build mode accepts only --out')
  const out = resolve(args.out),
    root = managerRoot(repo, out)
  return withLease(root, async () => {
    const log = evidence(out),
      controller = new AbortController()
    const abort = () => controller.abort()
    process.on('SIGINT', abort)
    process.on('SIGTERM', abort)
    try {
      const stacks = discoverStacks(repo),
        pins = sourcePins(repo, stacks),
        commands = []
      log.json('pins-before.json', pins)
      for (const stack of stacks) {
        controller.signal.throwIfAborted()
        commands.push(await buildOne(repo, stack.name, log, root, controller.signal))
      }
      assert.deepEqual(sourcePins(repo, stacks), pins, 'Source/install changed during builds')
      const receipt = {
        kind: 'profile-load-build-v1',
        pins,
        assets: assetPins(repo, stacks),
        commands,
      }
      log.json('build-proof.json', receipt)
      return receipt
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
  await buildProof(
    fileURLToPath(new URL('../../', import.meta.url)),
    options(process.argv.slice(2)),
  )
