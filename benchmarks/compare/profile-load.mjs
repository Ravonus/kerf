#!/usr/bin/env node
// Manager-only first-load profiling of prebuilt dashboards; never builds or writes canonical results.
import assert from 'node:assert/strict'
import { readFileSync, mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  LOAD,
  balancedOrders,
  discoverStacks,
  traceAttribution,
  cpuAttribution,
  summarizeTrials,
} from './profile-load-data.mjs'
import {
  sourcePins,
  assetPins,
  managerRoot,
  resources,
  verifyBuild,
  MAX_TRACE,
  MAX_CPU,
} from './profile-load-pins.mjs'
import { captureTrial, serveAssets } from './profile-load-capture.mjs'
import { withLease, evidence, closeBrowser, browserPin, toolPins } from './profile-load-io.mjs'

/** Both manager CLIs require explicit fresh output paths and reject unknown/duplicate flags. */
export function options(argv) {
  const result = { cycles: 1 },
    seen = new Set()
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i],
      value = argv[i + 1]
    assert.ok(
      ['--out', '--build-proof', '--cycles'].includes(name) && value,
      'Use --out DIR [--build-proof FILE] [--cycles 1|2]',
    )
    const field = name.slice(2)
    assert.ok(!seen.has(field), 'Duplicate option')
    seen.add(field)
    result[field] = field === 'cycles' ? Number(value) : value
  }
  assert.ok(result.out, 'Explicit --out directory is required')
  balancedOrders(result.cycles)
  return result
}

function saveTrial(log, name, result, url) {
  const { trace, cpu, ...row } = result
  log.json(name + '-capture.json', row)
  if (trace) row.traceFile = log.compressed(name + '.trace.json.gz', trace, MAX_TRACE)
  if (cpu)
    row.cpuFile = log.compressed(name + '.cpuprofile.gz', Buffer.from(JSON.stringify(cpu)), MAX_CPU)
  if (result.status === 'ok') {
    assert.ok(trace && cpu, 'Successful capture lacks raw evidence')
    row.timeline = traceAttribution(JSON.parse(trace.toString()).traceEvents, {
      origin: url,
      frame: row.frame,
      start: row.start,
      end: row.end,
    })
    const sampled = cpuAttribution(cpu, row.end)
    row.cpu = {
      totalRows: sampled.rows.length,
      top: sampled.rows.slice(0, 40),
      clock: sampled.clock,
      semantics:
        'Observed adjacent sample wall intervals; unsampled gaps remain unassigned. Not CPU counters.',
    }
  }
  log.json(name + '.json', row)
  return row
}

async function runOrders(browser, servers, orders, root, log, interrupted) {
  const trials = Object.fromEntries(Object.keys(servers).map((name) => [name, []]))
  for (const [round, order] of orders.entries())
    for (const name of order) {
      assert.ok(!interrupted(), 'Profile interrupted')
      const before = resources(root)
      log.append(
        name + '.log',
        JSON.stringify({ round, status: 'started', resources: before }) + '\n',
      )
      const server = servers[name],
        result = await captureTrial(browser, server.url)
      const row = saveTrial(log, `${name}-${round}`, result, server.url)
      row.resources = { before, after: resources(root) }
      trials[name].push(row)
      log.append(name + '.log', JSON.stringify({ round, ...row }) + '\n')
      assert.equal(row.status, 'ok', `${name} failed; full trial receipt retained`)
      assert.deepEqual(server.errors, [], 'Pinned server rejected a request')
    }
  return trials
}

/** Profile the built source receipt in one isolated browser, without modifying the benchmark. */
export async function profile(repo, args) {
  process.env.WEFT_COMPILER = 'native'
  const out = resolve(args.out),
    root = managerRoot(repo, out)
  process.env.TMPDIR = join(root, 'tmp')
  mkdirSync(process.env.TMPDIR, { recursive: true })
  return withLease(root, async () => {
    const log = evidence(out),
      servers = {}
    const outcome = { status: 'error', canonical: false, at: new Date().toISOString() }
    let browser,
      owner,
      interrupted = false
    /** @type {Error | undefined} */
    let failure
    const stop = () => {
      interrupted = true
      void owner?.kill().catch(() => {})
    }
    process.on('SIGINT', stop)
    process.on('SIGTERM', stop)
    try {
      assert.ok(args['build-proof'], 'Require --build-proof from profile-load-build.mjs')
      const stacks = discoverStacks(repo),
        pins = sourcePins(repo, stacks)
      const assets = assetPins(repo, stacks)
      const proof = JSON.parse(readFileSync(resolve(args['build-proof']), 'utf8'))
      verifyBuild(proof, pins, assets)
      const require = createRequire(join(repo, 'packages/warp/package.json'))
      const { chromium } = require('playwright-core')
      owner = await chromium.launchServer()
      browser = await chromium.connect(owner.wsEndpoint())
      const orders = balancedOrders(args.cycles)
      log.json('pins.json', {
        pins,
        assets,
        tools: toolPins(repo),
        browser: browserPin(owner, browser),
        protocol: await (await browser.newBrowserCDPSession()).send('Browser.getVersion'),
        orders,
        ...LOAD,
      })
      for (const stack of stacks)
        servers[stack.name] = await serveAssets(
          join(repo, 'benchmarks/compare', stack.name, 'dist'),
          assets[stack.name],
        )
      const trials = await runOrders(browser, servers, orders, root, log, () => interrupted)
      assert.deepEqual(sourcePins(repo, stacks), pins, 'Source/install changed during profiling')
      assert.deepEqual(assetPins(repo, stacks), assets, 'Built assets changed during profiling')
      outcome.stacks = summarizeTrials(trials)
      outcome.status = 'captured; analysis/acceptance pending'
    } catch (error) {
      failure = error instanceof Error ? error : new Error(String(error))
      log.json('failure.json', { error: String(error), outputBytes: log.used() })
    } finally {
      process.off('SIGINT', stop)
      process.off('SIGTERM', stop)
      const cleanup = await Promise.allSettled([
        closeBrowser(browser, owner),
        ...Object.values(servers).map((server) => server.close()),
      ])
      outcome.cleanup = cleanup.map((result) =>
        result.status === 'fulfilled' ? 'closed' : String(result.reason),
      )
      if (cleanup.some((result) => result.status === 'rejected')) {
        failure ??= new Error('Cleanup failed; see summary')
        outcome.status = 'error'
      }
      outcome.outputBytesBeforeSummary = log.used()
      log.json('summary.json', outcome)
    }
    if (failure) throw failure
    return outcome
  })
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const repo = fileURLToPath(new URL('../../', import.meta.url))
  await profile(repo, options(process.argv.slice(2)))
}
