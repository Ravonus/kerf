// Separate overlapping renderer scopes before correlating sampled stacks with flushes.
import assert from 'node:assert/strict'
import { orderedCpuSamples } from './profile-load-clock.mjs'

export const PHASES = {
  style: 'UpdateLayoutTree',
  layout: 'Layout',
  parse: 'ParseAuthorStyleSheet',
  forced: 'Blink.ForcedStyleAndLayout.UpdateTime',
  requests: 'Document::UpdateStyleAndLayout',
  resize: 'LocalFrameView::NotifyResizeObservers',
}

/** Return disjoint intervals without changing the caller's data. */
export function union(intervals) {
  const result = []
  for (const [from, to] of [...intervals].sort((a, b) => a[0] - b[0])) {
    assert.ok(Number.isFinite(from) && Number.isFinite(to) && to >= from, 'Bad interval')
    const last = result.at(-1)
    if (last && from <= last[1]) last[1] = Math.max(last[1], to)
    else if (to > from) result.push([from, to])
  }
  return result
}

const total = (intervals) => union(intervals).reduce((sum, [a, b]) => sum + b - a, 0)

/** Intersections measure overlap, not additional time or causal CPU cost. */
export function overlap(left, right) {
  const a = union(left),
    b = union(right)
  let i = 0,
    j = 0,
    us = 0
  while (i < a.length && j < b.length) {
    us += Math.max(0, Math.min(a[i][1], b[j][1]) - Math.max(a[i][0], b[j][0]))
    if (a[i][1] < b[j][1]) i++
    else j++
  }
  return us
}

/** Decode main-thread complete/synchronous scopes; unmatched pairs remain fatal. */
export function scopes(events, trial) {
  assert.ok(Array.isArray(events) && events.length > 0, 'Missing trace')
  const pending = [],
    result = []
  const thread = events.filter((e) => `${e.pid}:${e.tid}` === trial.timeline.thread)
  for (const event of thread.sort((a, b) => a.ts - b.ts)) {
    let item = event
    if (event.ph === 'B') pending.push(event)
    if (event.ph === 'E') {
      const begin = pending.pop()
      assert.ok(begin, 'Unpaired trace end')
      item = { ...begin, ph: 'X', dur: event.ts - begin.ts }
    }
    if (item.ph !== 'X') continue
    assert.ok(Number.isFinite(item.ts) && Number.isFinite(item.dur) && item.dur >= 0)
    const from = Math.max(trial.start, item.ts),
      to = Math.min(trial.end, item.ts + item.dur)
    if (to > from) result.push({ ...item, from, to })
  }
  assert.equal(pending.length, 0, 'Unpaired trace begin')
  assert.ok(result.length > 0, 'Empty renderer thread')
  return result
}

function callFrame(event) {
  const data = event.args?.data
  if (event.name !== 'FunctionCall' || !data?.url) return null
  // Trace FunctionCall coordinates are one-based; CPU callFrame coordinates are zero-based.
  assert.ok(data.lineNumber >= 1 && data.columnNumber >= 1, 'Invalid trace callsite')
  return {
    functionName: data.functionName,
    url: data.url,
    lineNumber: data.lineNumber - 1,
    columnNumber: data.columnNumber - 1,
  }
}

/** Count actual flush scopes and retain their enclosing callback/lifecycle evidence. */
export function phaseEvidence(events) {
  const intervals = Object.fromEntries(
    Object.entries(PHASES).map(([key, name]) => [
      key,
      events.filter((e) => e.name === name).map((e) => [e.from, e.to]),
    ]),
  )
  const phases = Object.fromEntries(
    Object.entries(intervals).map(([key, rows]) => [
      key,
      { count: rows.length, unionMs: total(rows) / 1000 },
    ]),
  )
  const flushes = events.filter((e) => ['UpdateLayoutTree', 'Layout'].includes(e.name))
  const sites = flushes.map((event) => {
    const parents = events
      .filter((p) => p !== event && p.from <= event.from && p.to >= event.to)
      .sort((a, b) => a.to - a.from - (b.to - b.from))
    return {
      phase: event.name,
      frame: event.args?.beginData?.frame ?? null,
      from: event.from,
      to: event.to,
      ms: (event.to - event.from) / 1000,
      elements: event.args?.elementCount ?? null,
      parents: parents.slice(0, 16).map((p) => p.name),
      callbacks: parents.map(callFrame).filter(Boolean),
    }
  })
  return {
    intervals,
    sites,
    summary: {
      phases,
      styleLayoutUnionMs: total([...intervals.style, ...intervals.layout]) / 1000,
      styleLayoutOverlapMs: overlap(intervals.style, intervals.layout) / 1000,
      forcedStyleMs: overlap(intervals.style, intervals.forced) / 1000,
      forcedLayoutMs: overlap(intervals.layout, intervals.forced) / 1000,
      resizeStyleMs: overlap(intervals.style, intervals.resize) / 1000,
      resizeLayoutMs: overlap(intervals.layout, intervals.resize) / 1000,
      callbackFlushCount: sites.filter((s) => s.callbacks.length).length,
      scrollEvents: events.filter(
        (e) => e.name === 'EventDispatch' && e.args?.data?.type === 'scroll',
      ).length,
    },
  }
}

function parentNodes(profile) {
  const parents = new Map(),
    ids = new Set(profile.nodes.map((n) => n.id))
  for (const node of profile.nodes)
    for (const id of node.children ?? []) {
      assert.ok(ids.has(id) && !parents.has(id), 'Missing/multiply parented CPU node')
      parents.set(id, node.id)
    }
  return parents
}

/** Keep sampled stacks and their overlap with scopes; samples are not API invocation counts. */
export function sampledStacks(profile, trial, intervals) {
  const { ordered, nodes, clock } = orderedCpuSamples(profile, trial.end)
  const parents = parentNodes(profile),
    groups = new Map()
  let conserved = 0
  for (const [index, sample] of ordered.entries()) {
    const from = Math.min(sample.timestampUs, trial.end)
    const to = Math.min(ordered[index + 1]?.timestampUs ?? from, trial.end)
    conserved += to - from
    const frames = [],
      seen = new Set()
    for (let id = sample.id; id !== undefined; id = parents.get(id)) {
      assert.ok(!seen.has(id), 'Cyclic CPU stack')
      seen.add(id)
      frames.push(nodes.get(id))
    }
    const key = sample.id
    const row = groups.get(key) ?? {
      id: sample.id,
      frames,
      samples: 0,
      sampledUs: 0,
      overlapUs: {},
    }
    row.samples++
    row.sampledUs += to - from
    for (const phase of ['style', 'layout', 'forced', 'resize'])
      row.overlapUs[phase] = (row.overlapUs[phase] ?? 0) + overlap([[from, to]], intervals[phase])
    groups.set(key, row)
  }
  assert.equal(conserved, clock.observedSpanUs, 'CPU interval conservation failed')
  assert.equal(
    [...groups.values()].reduce((n, r) => n + r.samples, 0),
    clock.rawSamples,
  )
  return { clock, rows: [...groups.values()].sort((a, b) => b.sampledUs - a.sampledUs) }
}
