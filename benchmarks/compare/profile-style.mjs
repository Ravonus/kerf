#!/usr/bin/env node
// Reanalyse immutable six-stack captures offline; mapped attribution is a separate hash-gated pass.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { gunzipSync } from 'node:zlib'
import { balancedOrders, requireSix, metricsFrom } from './profile-load-data.mjs'
import { digest, loadMaps } from './profile-style-maps.mjs'
import { scopes, phaseEvidence, sampledStacks } from './profile-style-data.mjs'

const json = (path) => JSON.parse(readFileSync(path, 'utf8'))

/** Fail closed on raw corruption, compression bombs or renamed receipt members. */
export function rawCapture(folder, record, maxBytes) {
  assert.ok(record.file === record.file.split('/').at(-1), 'Unsafe capture path')
  const compressed = readFileSync(join(folder, record.file))
  assert.equal(compressed.length, record.gzipBytes, 'Compressed capture size mismatch')
  assert.ok(compressed.length <= maxBytes, 'Oversized compressed capture')
  assert.equal(digest(compressed), record.gzipSha256, 'Compressed capture hash mismatch')
  const raw = gunzipSync(compressed, { maxOutputLength: maxBytes })
  assert.equal(raw.length, record.rawBytes, 'Raw capture size mismatch')
  assert.equal(digest(raw), record.rawSha256, 'Raw capture hash mismatch')
  return JSON.parse(raw)
}

/** Coverage comes from the captured source tree, not a guessed dashboard count. */
export function coverage(repo, pins, summary) {
  const tracked = execFileSync(
    'git',
    ['ls-tree', '-r', '--name-only', pins.pins.commit, '--', 'benchmarks/compare'],
    { cwd: repo, encoding: 'utf8' },
  )
    .trim()
    .split('\n')
    .filter((p) => /^benchmarks\/compare\/[^/]+\/stack.json$/.test(p))
    .map((p) => p.split('/')[2])
  requireSix(tracked)
  requireSix(Object.keys(pins.assets))
  requireSix(Object.keys(summary.stacks))
  assert.deepEqual(pins.orders, balancedOrders(1), 'Unbalanced capture order')
  for (const name of tracked) {
    const trials = summary.stacks[name].trials
    assert.equal(trials.length, 12, `Incomplete trials: ${name}`)
    for (const trial of trials) {
      assert.equal(trial.status, 'ok')
      assert.deepEqual(trial.errors, [])
      metricsFrom(trial.rawMetrics, trial.metrics.fcpMs)
    }
  }
  return tracked
}

/** Keep each trial and all sampled stacks; no automatic speed or source-cause acceptance. */
export function analyze(repo, folder, mapped = false) {
  const pins = json(join(folder, 'pins.json')),
    summary = json(join(folder, 'summary.json'))
  const stacks = coverage(repo, pins, summary),
    mapper = mapped ? loadMaps(repo, pins) : null
  const clockPath = 'benchmarks/compare/profile-load-clock.mjs'
  assert.equal(
    digest(readFileSync(new URL('./profile-load-clock.mjs', import.meta.url))),
    pins.tools[clockPath],
    'CPU normalizer differs from captured tool',
  )
  const result = {
    kind: 'profile-style-analysis-v1',
    source: pins.pins.commit,
    browser: pins.browser,
    host: pins.pins.host,
    compiler: pins.pins.compiler,
    dependencies: pins.pins.files,
    assets: pins.assets,
    orders: pins.orders,
    coverage: { tracked: stacks.length, analyzed: 6, trials: 72 },
    mapped,
    mapProofs: mapper?.proofs ?? [],
    stacks: {},
    semantics:
      'Per-phase wall unions overlap; CDP counters remain separate. CPU sample overlap is association, not API counts or CPU cost. Unmapped minified names are not source attribution.',
  }
  for (const stack of stacks) {
    result.stacks[stack] = summary.stacks[stack].trials.map((trial, round) => {
      const trace = rawCapture(folder, trial.traceFile, 8 * 1024 ** 2)
      const cpu = rawCapture(folder, trial.cpuFile, 4 * 1024 ** 2)
      const events = scopes(trace.traceEvents, trial),
        phases = phaseEvidence(events)
      const sampled = sampledStacks(cpu, trial, phases.intervals)
      const map = (frame) => (mapper ? mapper.frame(stack, frame) : frame)
      return {
        round,
        metrics: trial.metrics,
        summary: phases.summary,
        flushes: phases.sites.map((s) => ({ ...s, callbacks: s.callbacks.map(map) })),
        cpu: {
          clock: sampled.clock,
          nodes: cpu.nodes.map((node) => ({ ...node, callFrame: map(node.callFrame) })),
          rows: sampled.rows.map(({ frames: _frames, ...row }) => row),
        },
        raw: { trace: trial.traceFile, cpu: trial.cpuFile },
      }
    })
  }
  return result
}

/** Only explicit paths and the optional mapping switch are accepted. */
export function options(args) {
  const result = { mapped: false }
  while (args.length) {
    const key = args.shift()
    if (key === '--mapped') {
      result.mapped = true
      continue
    }
    assert.ok(['--repo', '--receipt', '--out'].includes(key) && args[0], 'Invalid analysis option')
    result[key.slice(2)] = resolve(args.shift())
  }
  assert.ok(result.repo && result.receipt && result.out, 'Require --repo --receipt --out')
  return result
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const args = options(process.argv.slice(2))
  const result = Buffer.from(JSON.stringify(analyze(args.repo, args.receipt, args.mapped)) + '\n')
  assert.ok(result.length < 16 * 1024 ** 2, 'Analysis output exceeds 16 MiB')
  writeFileSync(args.out, result, { flag: 'wx' })
  console.log(JSON.stringify({ out: args.out, bytes: result.length, mapped: args.mapped }))
}
