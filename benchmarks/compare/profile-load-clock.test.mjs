// Replay the immutable manager capture; these are clock-accounting checks, not load measurements.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
import { createHash } from 'node:crypto'
import { cpuAttribution } from './profile-load-data.mjs'
import { orderedCpuSamples } from './profile-load-clock.mjs'

const metadata = JSON.parse(readFileSync(new URL('./profile-load-captured.json', import.meta.url)))
const packed = readFileSync(new URL('./profile-load-captured.cpuprofile.gz', import.meta.url))
const raw = gunzipSync(packed)
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
const captured = () => JSON.parse(raw)
const synthetic = () => ({
  startTime: 1000,
  endTime: 5000,
  nodes: [1, 2, 3].map((id) => ({ id, callFrame: { functionName: `f${id}`, url: 'app.js' } })),
  samples: [1, 2, 3],
  timeDeltas: [1000, -200, 1200],
})
const total = (rows, key) => rows.reduce((sum, row) => sum + row[key], 0)

test('the 476-sample Chrome 156 fixture retains its exact compressed and raw hashes/schema', () => {
  assert.equal(hash(packed), metadata.gzipSha256)
  assert.equal(hash(raw), metadata.jsonSha256)
  const profile = captured()
  assert.deepEqual(
    Object.keys(profile).sort((a, b) => a.localeCompare(b)),
    ['endTime', 'nodes', 'samples', 'startTime', 'timeDeltas'],
  )
  assert.equal(profile.nodes.length, 521)
  assert.equal(profile.samples.length, 476)
  assert.equal(profile.timeDeltas.length, 476)
  assert.deepEqual(
    profile.timeDeltas.flatMap((delta, index) => (delta < 0 ? [{ index, deltaUs: delta }] : [])),
    [
      { index: 188, deltaUs: -59 },
      { index: 193, deltaUs: -4 },
      { index: 238, deltaUs: -365 },
    ],
  )
})

test('captured signed deltas reorder six samples across three pairs without shifting clocks or losing counters', () => {
  const profile = captured(),
    before = JSON.stringify(profile)
  const { rows, clock } = cpuAttribution(profile, metadata.cutoffUs)
  const expectedOrder = Array.from({ length: 476 }, (_, index) => index)
  for (const [left, right] of [
    [187, 188],
    [192, 193],
    [237, 238],
  ])
    [expectedOrder[left], expectedOrder[right]] = [expectedOrder[right], expectedOrder[left]]
  assert.deepEqual(clock.orderedIndices, expectedOrder)
  const { ordered } = orderedCpuSamples(profile, metadata.cutoffUs)
  let timestamp = profile.startTime
  const rawTimes = profile.timeDeltas.map((delta) => (timestamp += delta))
  assert.deepEqual(
    ordered,
    expectedOrder.map((index) => ({
      id: profile.samples[index],
      index,
      timestampUs: rawTimes[index],
    })),
  )
  assert.equal(clock.rawSamples, 476)
  assert.equal(clock.orderedSamples, 476)
  assert.equal(clock.reorderedSamples, 6)
  assert.equal(clock.maxRankDisplacement, 1)
  assert.equal(clock.negativeDeltas.length, 3)
  assert.equal(clock.maxBackwardDeltaUs, 365)
  assert.equal(clock.timestampAdjustmentUs, 0)
  assert.equal(clock.signedDeltaSumUs, 638028)
  assert.equal(clock.firstTimestampUs, 277166898148)
  assert.equal(clock.lastTimestampUs, 277167535611)
  assert.equal(clock.unobservedHeadUs, 565)
  assert.equal(clock.unobservedTailUs, 0)
  assert.equal(clock.observedSpanUs, 629881)
  assert.equal(clock.windowUs, 630446)
  assert.equal(clock.attributedUs, clock.observedSpanUs)
  assert.equal(total(rows, 'samples'), 476)
  assert.ok(Math.abs(total(rows, 'sampledMs') * 1000 - clock.observedSpanUs) < 1e-6)
  assert.equal(JSON.stringify(profile), before)
  assert.equal(hash(packed), metadata.gzipSha256)
})

test('chronological node pairing follows observed intervals, with no head or tail extrapolation', () => {
  const { rows, clock } = cpuAttribution(synthetic(), 4000)
  assert.deepEqual(clock.orderedIndices, [1, 0, 2])
  assert.deepEqual(
    rows.map((row) => [row.functionName, row.samples, row.sampledMs]),
    [
      ['f1', 1, 1],
      ['f2', 1, 0.2],
      ['f3', 1, 0],
    ],
  )
  assert.equal(clock.unobservedHeadUs, 800)
  assert.equal(clock.observedSpanUs, 1200)
  assert.equal(clock.unobservedTailUs, 1000)
  assert.equal(clock.windowUs, 3000)
  assert.equal(total(rows, 'samples'), 3)
  assert.equal(total(rows, 'attributedSamples'), 2)
})

test('equal timestamps keep input ordering and zero-width samples remain counted', () => {
  const profile = { ...synthetic(), timeDeltas: [1000, 0, 1000] }
  const { rows, clock } = cpuAttribution(profile, 3500)
  assert.deepEqual(clock.orderedIndices, [0, 1, 2])
  assert.equal(total(rows, 'samples'), 3)
  assert.equal(rows.find((row) => row.functionName === 'f1').sampledMs, 0)
  assert.equal(clock.unobservedHeadUs, 1000)
  assert.equal(clock.unobservedTailUs, 500)
  assert.equal(clock.attributedUs, 1000)
})

test('all nodes are validated, including a missing post-cutoff node and duplicate node ids', () => {
  const profile = captured()
  profile.samples[475] = 999999
  assert.throws(() => cpuAttribution(profile, metadata.cutoffUs), /missing node/)
  const duplicate = synthetic()
  duplicate.nodes.push(duplicate.nodes[0])
  assert.throws(() => cpuAttribution(duplicate, 4000), /duplicate CPU node/)
})

test('nonfinite/fractional/overflowing deltas or clocks never become zero cost', () => {
  for (const bad of [NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const profile = synthetic()
    profile.timeDeltas[1] = bad
    assert.throws(() => cpuAttribution(profile, 4000), /Invalid CPU sample/)
  }
  for (const field of ['startTime', 'endTime'])
    for (const bad of [NaN, Infinity, -1, Number.MAX_SAFE_INTEGER + 1])
      assert.throws(() => cpuAttribution({ ...synthetic(), [field]: bad }, 4000), /clock/)
  for (const cutoff of [NaN, Infinity, 999, 5001])
    assert.throws(() => cpuAttribution(synthetic(), cutoff), /clock/)
})

test('extreme rollback/advance rejects against original bounds, not an empirical jitter allowance', () => {
  for (const bad of [-1001, 4001, Number.MAX_SAFE_INTEGER]) {
    const profile = synthetic()
    profile.timeDeltas[1] = bad
    assert.throws(() => orderedCpuSamples(profile, 4000), /outside profile clock/)
  }
  const profile = synthetic()
  profile.timeDeltas[0] = -1
  assert.throws(() => orderedCpuSamples(profile, 4000), /outside profile clock/)
})

test('the complete captured profile also conserves its measured envelope without inventing its last 71us', () => {
  const profile = captured(),
    { clock, rows } = cpuAttribution(profile, profile.endTime)
  assert.equal(clock.unobservedHeadUs, 565)
  assert.equal(clock.unobservedTailUs, 71)
  assert.equal(clock.observedSpanUs, 637463)
  assert.equal(clock.windowUs, 638099)
  assert.equal(clock.attributedUs + clock.unobservedHeadUs + clock.unobservedTailUs, clock.windowUs)
  assert.equal(total(rows, 'samples'), 476)
})

test('no fabricated samples or durations fill unsampled windows', () => {
  const { clock, rows } = cpuAttribution(synthetic(), 1500)
  assert.equal(clock.attributedUs, 0)
  assert.equal(clock.unobservedHeadUs, 500)
  assert.equal(clock.atOrAfterCutoffSamples, 3)
  assert.equal(total(rows, 'samples'), 3)
  assert.equal(total(rows, 'sampledMs'), 0)
})
