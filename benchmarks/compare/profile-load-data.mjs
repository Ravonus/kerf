// Validate balanced dashboard profiles without adding nested trace durations.
import assert from 'node:assert/strict'
import { orderedCpuSamples } from './profile-load-clock.mjs'
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

export const STACKS = [
  'kerf-veneer',
  'kerf-plain',
  'solid-kobalte',
  'react-radix',
  'react-zustand',
  'react-mui',
]

/** Fixed instrumentation settings mirror the canonical load window. */
export const LOAD = {
  viewport: { width: 1280, height: 800 },
  cpuRate: 4,
  settleMs: 300,
  sampleIntervalUs: 1000,
  categories:
    'devtools.timeline,disabled-by-default-devtools.timeline,blink,v8,blink.user_timing,disabled-by-default-v8.compile',
  readiness: 'Apollo 0, then 300 ms',
  caveats: 'Tracing/sampling add overhead; fresh contexts do not make browser/OS caches cold.',
}

/** Require every comparison stack, with no duplicate or additional dashboard. */
export function requireSix(names) {
  assert.deepEqual(
    [...names].sort((left, right) => left.localeCompare(right)),
    [...STACKS].sort((left, right) => left.localeCompare(right)),
    'Expected all six dashboard stacks',
  )
}

/** Compare on-disk dashboard manifests with Git, before opening any browser. */
export function discoverStacks(repo) {
  const here = join(repo, 'benchmarks/compare')
  const disk = readdirSync(here).filter((name) => existsSync(join(here, name, 'stack.json')))
  const tracked = execFileSync('git', ['ls-files', 'benchmarks/compare/*/stack.json'], {
    cwd: repo,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .filter((p) => /^benchmarks\/compare\/[^/]+\/stack.json$/.test(p))
    .map((p) => p.split('/')[2])
  requireSix(disk)
  assert.deepEqual(
    disk.sort((left, right) => left.localeCompare(right)),
    tracked.sort((left, right) => left.localeCompare(right)),
    'Dashboard coverage differs from Git',
  )
  return STACKS.map((name) => ({
    name,
    ...JSON.parse(readFileSync(join(here, name, 'stack.json'), 'utf8')),
  }))
}

/** Each Williams row and its reverse balance positions and within-row predecessors. */
export function balancedOrders(cycles = 1) {
  assert.ok(Number.isInteger(cycles) && cycles >= 1 && cycles <= 2, 'Cycles must be 1 or 2')
  const first = [0, 1, 5, 2, 4, 3]
  return Array.from({ length: cycles }, () =>
    STACKS.flatMap((_, offset) => {
      const row = first.map((index) => STACKS[(index + offset) % STACKS.length])
      return [row, [...row].reverse()]
    }),
  ).flat()
}

/** Reject missing, nonfinite or invalid canonical metrics instead of substituting zero. */
export function metricsFrom(raw, fcp) {
  for (const name of [
    'ScriptDuration',
    'RecalcStyleDuration',
    'LayoutDuration',
    'TaskDuration',
    'JSHeapUsedSize',
    'Nodes',
    'Timestamp',
  ])
    assert.ok(Number.isFinite(raw[name]) && raw[name] >= 0, `Invalid metric ${name}`)
  assert.ok(
    raw.Timestamp > 0 && Number.isInteger(raw.Nodes) && raw.Nodes > 0,
    'Invalid node/time metric',
  )
  assert.ok(raw.JSHeapUsedSize > 0 && raw.TaskDuration > 0, 'Invalid heap/task metric')
  assert.ok(Number.isFinite(fcp) && fcp > 0, 'Invalid first-contentful-paint')
  return {
    scriptMs: raw.ScriptDuration * 1000,
    styleMs: raw.RecalcStyleDuration * 1000,
    layoutMs: raw.LayoutDuration * 1000,
    taskMs: raw.TaskDuration * 1000,
    heapMB: raw.JSHeapUsedSize / 1048576,
    nodes: raw.Nodes,
    fcpMs: fcp,
  }
}

const key = (event) => `${event.pid}:${event.tid}`
const eventUrl = (event) => {
  const data = event.args?.data ?? event.args?.beginData ?? {}
  return data.url ?? data.scriptName ?? data.styleSheetUrl ?? ''
}

function renderer(events, origin, frame) {
  const mains = new Set(
    events
      .filter(
        (e) => e.ph === 'M' && e.name === 'thread_name' && /^(Cr)?RendererMain$/.test(e.args?.name),
      )
      .map(key),
  )
  const candidates = new Set(
    events
      .filter((e) => {
        const data = e.args?.data ?? e.args?.beginData ?? {}
        return (
          mains.has(key(e)) &&
          eventUrl(e).startsWith(origin) &&
          (!data.frame || data.frame === frame)
        )
      })
      .map(key),
  )
  assert.equal(candidates.size, 1, 'Cannot identify a unique target renderer main thread')
  return [...candidates][0]
}

function durations(events, thread, start, end) {
  const pending = [],
    out = []
  let unpaired = 0
  for (const event of events.filter((e) => key(e) === thread).sort((a, b) => a.ts - b.ts)) {
    if (event.ph === 'B') pending.push(event)
    let item = event
    if (event.ph === 'E') {
      const opening = pending.pop()
      if (!opening) {
        unpaired++
        continue
      }
      item = { ...opening, ph: 'X', dur: event.ts - opening.ts }
    }
    if (item.ph !== 'X') continue
    assert.ok(
      Number.isFinite(item.ts) && Number.isFinite(item.dur) && item.dur >= 0,
      'Invalid trace duration',
    )
    const from = Math.max(start, item.ts),
      to = Math.min(end, item.ts + item.dur)
    if (to > from) out.push({ ...item, from, to })
  }
  return { out, unpaired: unpaired + pending.length }
}

function covered(intervals) {
  let edge = -Infinity,
    total = 0
  for (const [from, to] of intervals.sort((a, b) => a[0] - b[0])) {
    total += Math.max(0, to - Math.max(from, edge))
    edge = Math.max(edge, to)
  }
  return total / 1000
}

/** Timeline rows are inclusive/union wall durations, never additive CPU allocations. */
export function traceAttribution(events, { origin, frame, start, end }) {
  assert.ok(Array.isArray(events) && events.length > 0, 'Missing trace events')
  assert.ok(Number.isFinite(start) && Number.isFinite(end) && end > start, 'Invalid trace window')
  const thread = renderer(events, origin, frame)
  const { out, unpaired } = durations(events, thread, start, end)
  assert.ok(out.length > 0, 'No target main-thread work in capture window')
  const groups = new Map()
  for (const event of out) {
    const name = event.name,
      url = eventUrl(event),
      id = JSON.stringify([name, url])
    const row = groups.get(id) ?? { name, url, count: 0, inclusiveMs: 0, intervals: [] }
    row.count++
    row.inclusiveMs += (event.to - event.from) / 1000
    row.intervals.push([event.from, event.to])
    groups.set(id, row)
  }
  const rows = [...groups.values()]
    .map(({ intervals, ...row }) => ({
      ...row,
      coveredMs: covered(intervals),
    }))
    .sort((a, b) => b.coveredMs - a.coveredMs)
  return {
    thread,
    unpaired,
    eventCount: out.length,
    busyCoveredMs: covered(
      out.filter((e) => /RunTask|ThreadControllerImpl/.test(e.name)).map((e) => [e.from, e.to]),
    ),
    cssParsing: rows.filter((r) => /Parse.*Style|CSS.*Parse/i.test(r.name)),
    rows,
    semantics:
      'Inclusive rows overlap; unions are per row. Zero CSS events does not prove zero CSS work.',
  }
}

/** Attribute only observed adjacent sample intervals; leave unsampled head/tail time unassigned. */
export function cpuAttribution(profile, cutoff) {
  const { nodes, ordered, clock } = orderedCpuSamples(profile, cutoff)
  const groups = new Map()
  let attributedUs = 0,
    attributedSamples = 0
  for (const [index, sample] of ordered.entries()) {
    const frame = nodes.get(sample.id),
      name = JSON.stringify(frame)
    const row = groups.get(name) ?? { ...frame, samples: 0, attributedSamples: 0, sampledUs: 0 }
    row.samples++ // Preserve even zero-width, final and post-cutoff samples in the counters.
    const next = ordered[index + 1]
    const duration = next
      ? Math.min(next.timestampUs, cutoff) - Math.min(sample.timestampUs, cutoff)
      : 0
    assert.ok(Number.isFinite(duration) && duration >= 0, 'Invalid ordered CPU interval')
    row.sampledUs += duration
    attributedUs += duration
    if (duration > 0) {
      row.attributedSamples++
      attributedSamples++
    }
    groups.set(name, row)
  }
  assert.equal(attributedUs, clock.observedSpanUs, 'CPU observed interval counter mismatch')
  const rows = [...groups.values()]
    .map(({ sampledUs, ...row }) => ({ ...row, sampledMs: sampledUs / 1000 }))
    .sort((left, right) => right.sampledMs - left.sampledMs)
  assert.equal(
    rows.reduce((total, row) => total + row.samples, 0),
    clock.rawSamples,
    'CPU sample counter mismatch',
  )
  return { rows, clock: { ...clock, attributedUs, attributedSamples } }
}

/** Keep every trial and its median/range; no automatic performance acceptance. */
export function summarizeTrials(trials) {
  requireSix(Object.keys(trials))
  assert.equal(
    new Set(Object.values(trials).map((rows) => rows.length)).size,
    1,
    'Unequal trial coverage',
  )
  return Object.fromEntries(
    STACKS.map((name) => {
      const rows = trials[name]
      assert.ok(
        [12, 24].includes(rows.length) && rows.every((r) => r.status === 'ok'),
        `Incomplete trials: ${name}`,
      )
      const expected = [
        'scriptMs',
        'styleMs',
        'layoutMs',
        'taskMs',
        'heapMB',
        'nodes',
        'fcpMs',
      ].sort((left, right) => left.localeCompare(right))
      for (const row of rows)
        assert.deepEqual(
          Object.keys(row.metrics).sort((left, right) => left.localeCompare(right)),
          expected,
          'Missing summary metric',
        )
      const summary = Object.fromEntries(
        Object.keys(rows[0].metrics).map((metric) => {
          const values = rows.map((row) => row.metrics[metric]).sort((a, b) => a - b)
          assert.ok(values.every(Number.isFinite), `Invalid summary metric ${metric}`)
          const half = values.length / 2
          return [
            metric,
            { median: (values[half - 1] + values[half]) / 2, min: values[0], max: values.at(-1) },
          ]
        }),
      )
      return [name, { trials: rows, summary }]
    }),
  )
}
