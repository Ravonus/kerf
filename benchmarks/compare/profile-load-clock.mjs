// Keep raw clocks intact. DevTools reconstructs cumulative timestamps and sorts sample/time pairs.
// Pinned protocol/DevTools sources and hashes live in profile-load-captured.json.
import assert from 'node:assert/strict'

function profileNodes(profile, cutoff) {
  assert.ok(
    Number.isSafeInteger(profile.startTime) &&
      profile.startTime >= 0 &&
      Number.isSafeInteger(profile.endTime) &&
      profile.endTime > profile.startTime,
    'Invalid CPU profile clock bounds',
  )
  assert.ok(
    Number.isFinite(cutoff) && cutoff > profile.startTime && cutoff <= profile.endTime,
    'Invalid CPU cutoff clock window',
  )
  assert.ok(Array.isArray(profile.nodes) && profile.nodes.length > 0, 'Missing CPU nodes')
  const nodes = new Map()
  for (const node of profile.nodes) {
    assert.ok(
      Number.isSafeInteger(node.id) &&
        node.id > 0 &&
        !nodes.has(node.id) &&
        node.callFrame &&
        typeof node.callFrame === 'object',
      'Invalid or duplicate CPU node',
    )
    nodes.set(node.id, node.callFrame)
  }
  assert.ok(
    Array.isArray(profile.samples) &&
      profile.samples.length > 0 &&
      Array.isArray(profile.timeDeltas) &&
      profile.samples.length === profile.timeDeltas.length,
    'Missing or inconsistent CPU samples',
  )
  return nodes
}

/** Order signed timestamp/sample pairs without altering timestamps, node ids or raw arrays. */
export function orderedCpuSamples(profile, cutoff) {
  const nodes = profileNodes(profile, cutoff),
    negativeDeltas = []
  let timestamp = profile.startTime
  const ordered = profile.samples.map((id, index) => {
    const delta = profile.timeDeltas[index]
    assert.ok(
      Number.isSafeInteger(delta) && Number.isSafeInteger(id) && nodes.has(id),
      'Invalid CPU sample delta or missing node',
    )
    timestamp += delta
    assert.ok(
      Number.isSafeInteger(timestamp) &&
        timestamp >= profile.startTime &&
        timestamp <= profile.endTime,
      'CPU sample timestamp outside profile clock bounds',
    )
    if (delta < 0) negativeDeltas.push({ index, deltaUs: delta, timestampUs: timestamp })
    return { id, index, timestampUs: timestamp }
  })
  const signedDeltaSumUs = timestamp - profile.startTime
  ordered.sort((left, right) => left.timestampUs - right.timestampUs || left.index - right.index)
  const changes = ordered.flatMap((sample, rank) =>
    sample.index === rank
      ? []
      : [{ originalIndex: sample.index, orderedIndex: rank, timestampUs: sample.timestampUs }],
  )
  const first = ordered[0].timestampUs,
    last = ordered.at(-1).timestampUs
  const clock = {
    method:
      'Cumulative signed microseconds; stable timestamp/sample ordering; observed intervals only',
    profileStartUs: profile.startTime,
    profileEndUs: profile.endTime,
    cutoffUs: cutoff,
    rawSamples: profile.samples.length,
    orderedSamples: ordered.length,
    negativeDeltas,
    signedDeltaSumUs,
    maxBackwardDeltaUs: negativeDeltas.reduce((value, row) => Math.max(value, -row.deltaUs), 0),
    reorderedSamples: changes.length,
    changes,
    maxRankDisplacement: changes.reduce(
      (value, row) => Math.max(value, Math.abs(row.originalIndex - row.orderedIndex)),
      0,
    ),
    timestampAdjustmentUs: 0,
    orderedIndices: ordered.map((sample) => sample.index),
    firstTimestampUs: first,
    lastTimestampUs: last,
    windowUs: cutoff - profile.startTime,
    unobservedHeadUs: Math.min(first, cutoff) - profile.startTime,
    observedSpanUs: Math.max(0, Math.min(last, cutoff) - Math.min(first, cutoff)),
    unobservedTailUs: cutoff - Math.min(last, cutoff),
    atOrAfterCutoffSamples: ordered.filter((sample) => sample.timestampUs >= cutoff).length,
  }
  assert.equal(
    clock.unobservedHeadUs + clock.observedSpanUs + clock.unobservedTailUs,
    clock.windowUs,
    'CPU clock coverage is not conserved',
  )
  return { nodes, ordered, clock }
}
