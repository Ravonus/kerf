// Archived measurements remain separate from fresh builds and source-level attribution.

/** Every emitted-byte vector retains the six dashboard stacks, including missing entries. */
export const STACKS = [
  'kerf-veneer',
  'kerf-plain',
  'solid-kobalte',
  'react-radix',
  'react-zustand',
  'react-mui',
]

/** Normalize history and results without inventing zero bytes for an absent stack. */
export function stackVector(stacks) {
  return Object.fromEntries(
    STACKS.map((name) => {
      const entry = stacks[name],
        value = entry?.size ?? entry
      const js = typeof value?.js === 'number' ? value.js : value?.js?.br
      const css = typeof value?.css === 'number' ? value.css : value?.css?.br
      if (
        (js !== undefined && (!Number.isSafeInteger(js) || js < 0)) ||
        (css !== undefined && (!Number.isSafeInteger(css) || css < 0))
      )
        throw new Error(`Invalid archived bytes for ${name}`)
      return [name, typeof js === 'number' && typeof css === 'number' ? { js, css } : null]
    }),
  )
}

/** A six-stack assertion rejects an incomplete historical receipt. */
export function requireSix(vector) {
  const missing = STACKS.filter((name) => !vector[name])
  if (missing.length) throw new Error(`Missing dashboard stacks: ${missing.join(', ')}`)
}

/** Archive deltas do not imply a new source-matched build or a single causal commit. */
export function vectorDelta(before, after) {
  return Object.fromEntries(
    STACKS.map((name) => {
      const a = before[name],
        b = after[name]
      return [name, a && b ? { js: b.js - a.js, css: b.css - a.css } : null]
    }),
  )
}

/** Follow first parents when possible, explicitly marking necessary merge-parent bridges. */
export function ancestryEdges(repo, from, to) {
  if (!repo.ancestor(from, to)) throw new Error('Baseline is not an ancestor of target')
  const edges = []
  let current = to
  while (current !== from) {
    if (edges.length >= 512) throw new Error('Historical path exceeds the 512-step audit bound')
    const parents = repo.parents(current)
    const index = parents.findIndex((parent) => repo.ancestor(from, parent))
    if (index < 0) throw new Error(`No parent reaches baseline at ${current}`)
    edges.push({ commit: current, parent: parents[index], parentNumber: index + 1 })
    current = parents[index]
  }
  return edges.reverse()
}

/** First-parent integration changes remain visible when the baseline entered through a merge. */
export function firstParentEdges(repo, from, to) {
  return repo
    .git(['rev-list', '--first-parent', '--reverse', `${from}..${to}`])
    .split('\n')
    .filter(Boolean)
    .filter((commit) => repo.ancestor(from, commit))
    .map((commit) => {
      const parent = repo.parents(commit)[0]
      return { commit, parent, parentNumber: 1, baselineIntroduced: !repo.ancestor(from, parent) }
    })
}

/** Read the pinned archive; dirty and off-ancestry entries remain visible as confounders. */
export function archivedRecords(repo, container, target) {
  const path = 'evals/results/compare-history.jsonl'
  const text = repo.text(container, path)
  if (!text) throw new Error(`No historical receipts at ${container}:${path}`)
  return text
    .trim()
    .split('\n')
    .map((line, index) => {
      const record = JSON.parse(line)
      let source = null,
        sourceError = null
      try {
        source = repo.resolve(record.commit)
      } catch (error) {
        if (error.status !== 128) throw error
        sourceError = String(error.stderr).trim()
      }
      const vector = stackVector(record.stacks)
      return {
        ...record,
        line: index + 1,
        source,
        sourceError,
        vector,
        sixStacks: STACKS.every((name) => vector[name]),
        ancestorOfTarget: source !== null && repo.ancestor(source, target),
      }
    })
}

/** Select an unambiguous clean source receipt, not a stale results file at that revision. */
export function sourceReceipt(records, source) {
  const found = records.filter((record) => record.source === source && record.dirty === false)
  if (!found.length) throw new Error(`No clean archived receipt for ${source}`)
  if (new Set(found.map((record) => JSON.stringify(record.vector))).size !== 1)
    throw new Error(`Conflicting archived byte vectors for ${source}`)
  return found[0]
}

/** Attribute archived intervals only to their complete list of source-changing edges. */
export function receiptIntervals(records, nodes, steps) {
  const selected = nodes.flatMap((source, index) => {
    const rows = records.filter((record) => record.source === source && record.dirty === false)
    if (!rows.length || new Set(rows.map((row) => JSON.stringify(row.vector))).size !== 1) return []
    return [{ ...rows[0], index }]
  })
  return selected.slice(1).map((after, n) => {
    const before = selected[n],
      edges = steps.slice(before.index, after.index)
    return {
      from: before.source,
      to: after.source,
      fromLine: before.line,
      toLine: after.line,
      complete: before.sixStacks && after.sixStacks,
      archivedDelta: vectorDelta(before.vector, after.vector),
      inputChanges: edges.filter((edge) => edge.delta.files.length).map((edge) => edge.commit),
    }
  })
}
