// Offline controls cover overlap, signed sample conservation and fail-closed source attribution.
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, relative } from 'node:path'
import { execFileSync } from 'node:child_process'
import { gzipSync } from 'node:zlib'
import { union, overlap, scopes, phaseEvidence, sampledStacks } from './profile-style-data.mjs'
import { coverage, rawCapture } from './profile-style.mjs'
import { balancedOrders, STACKS } from './profile-load-data.mjs'
import { digest, loadMaps, verifyAssets } from './profile-style-maps.mjs'
import { preservingAssets } from './profile-style-build.mjs'
import { assetPins } from './profile-load-pins.mjs'

test('nested style/layout/forced wrappers are unions and intersections, not summed costs', () => {
  assert.deepEqual(
    union([
      [0, 10],
      [2, 6],
      [8, 15],
    ]),
    [[0, 15]],
  )
  assert.equal(
    overlap(
      [
        [0, 10],
        [2, 6],
      ],
      [[4, 12]],
    ),
    6,
  )
  const events = [
    ['UpdateLayoutTree', 0, 10],
    ['Layout', 4, 8],
    ['Blink.ForcedStyleAndLayout.UpdateTime', 0, 10],
  ].map(([name, from, to]) => ({ name, from, to }))
  const { summary } = phaseEvidence(events)
  assert.equal(summary.styleLayoutUnionMs, 0.01)
  assert.equal(summary.styleLayoutOverlapMs, 0.004)
  assert.equal(summary.forcedLayoutMs, 0.004)
  assert.throws(() => union([[0, Infinity]]), /Bad interval/)
})

test('main-thread scope pairing rejects incomplete evidence', () => {
  const trial = { timeline: { thread: '1:2' }, start: 0, end: 20 }
  const begin = { pid: 1, tid: 2, ts: 1, name: 'Layout', ph: 'B' }
  assert.throws(() => scopes([begin], trial), /Unpaired/)
  assert.equal(scopes([begin, { ...begin, ts: 11, ph: 'E' }], trial)[0].to, 11)
})

test('signed samples conserve counters and overlap without inventing API calls', () => {
  const profile = {
    startTime: 0,
    endTime: 20,
    nodes: [
      { id: 1, callFrame: { functionName: '(root)' }, children: [2] },
      { id: 2, callFrame: { functionName: 'read' } },
    ],
    samples: [1, 2, 1],
    timeDeltas: [2, 8, -1],
  }
  const phases = { style: [[0, 20]], layout: [], forced: [[2, 10]], resize: [] }
  const result = sampledStacks(profile, { end: 20 }, phases)
  assert.equal(
    result.rows.reduce((n, r) => n + r.samples, 0),
    3,
  )
  assert.equal(
    result.rows.reduce((n, r) => n + r.sampledUs, 0),
    8,
  )
  assert.equal(
    result.rows.reduce((n, r) => n + r.overlapUs.style, 0),
    8,
  )
  assert.throws(
    () => sampledStacks({ ...profile, samples: [1, 99, 1] }, { end: 20 }, phases),
    /missing node/,
  )
})

function fixture(run) {
  const repo = mkdtempSync(join(tmpdir(), 'weft-style-'))
  try {
    const git = (...args) => execFileSync('git', args, { cwd: repo, encoding: 'utf8' }).trim()
    git('init', '-q')
    mkdirSync(join(repo, 'src'))
    writeFileSync(join(repo, 'src/view.ts'), 'const count = 1\n')
    for (const stack of STACKS) {
      const dist = join(repo, 'benchmarks/compare', stack, 'dist')
      mkdirSync(dist, { recursive: true })
      writeFileSync(join(dist, '../stack.json'), '{}\n')
    }
    git('add', '.')
    git('-c', 'user.name=Test', '-c', 'user.email=test@example.invalid', 'commit', '-qm', 'Fixture')
    run(repo, git('rev-parse', 'HEAD'))
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
}

function mappedFixture(repo, commit) {
  const assets = {}
  for (const stack of STACKS) {
    const dist = join(repo, 'benchmarks/compare', stack, 'dist')
    mkdirSync(dist, { recursive: true })
    writeFileSync(join(dist, 'app.js'), 'const count=1;')
    writeFileSync(join(dist, 'app.css'), 'body{color:red}')
    writeFileSync(join(dist, 'index.html'), '<div></div>')
    const payload = {
      version: 3,
      file: 'app.js',
      names: [],
      mappings: 'AAAA',
      sources: [relative(dist, join(repo, 'src/view.ts'))],
      sourcesContent: ['const count = 1\n'],
    }
    writeFileSync(join(dist, 'app.js.map'), JSON.stringify(payload))
    assets[stack] = Object.fromEntries(
      ['app.js', 'app.css', 'index.html'].map((name) => {
        const data = readFileSync(join(dist, name))
        return [name, { bytes: data.length, sha256: digest(data) }]
      }),
    )
  }
  return { pins: { commit }, assets }
}

test('all six asset hashes and Git source content precede mapped attribution', () =>
  fixture((repo, commit) => {
    const pins = mappedFixture(repo, commit),
      mapper = loadMaps(repo, pins)
    const frame = mapper.frame('weft-warp', {
      url: 'http://localhost/app.js',
      lineNumber: 0,
      columnNumber: 0,
    })
    assert.equal(frame.original.path, 'src/view.ts')
    assert.equal(frame.original.line, 1)
    const dist = join(repo, 'benchmarks/compare/react-mui/dist')
    writeFileSync(join(dist, 'app.css'), 'body{color:tan}')
    assert.throws(() => loadMaps(repo, pins), /Mapped asset hash mismatch/)
    assert.throws(() => verifyAssets(dist, {}), /coverage mismatch/)
  }))

test('a correct asset with a wrong original source map is rejected', () =>
  fixture((repo, commit) => {
    const pins = mappedFixture(repo, commit)
    const file = join(repo, 'benchmarks/compare/weft-warp/dist/app.js.map')
    const map = JSON.parse(readFileSync(file))
    map.sourcesContent[0] = 'const count = 2\n'
    writeFileSync(file, JSON.stringify(map))
    assert.throws(() => loadMaps(repo, pins), /Mapped source mismatch/)
  }))

test('Git-discovered six-stack coverage rejects missing stacks and invalid metrics', () =>
  fixture((repo, commit) => {
    const pins = mappedFixture(repo, commit)
    pins.orders = balancedOrders(1)
    const rawMetrics = {
      ScriptDuration: 1,
      RecalcStyleDuration: 1,
      LayoutDuration: 1,
      TaskDuration: 1,
      JSHeapUsedSize: 1,
      Nodes: 1,
      Timestamp: 1,
    }
    const trial = { status: 'ok', errors: [], metrics: { fcpMs: 1 }, rawMetrics }
    const summary = {
      stacks: Object.fromEntries(
        STACKS.map((s) => [
          s,
          {
            trials: Array.from({ length: 12 }, () => ({ ...trial })),
          },
        ]),
      ),
    }
    assert.equal(coverage(repo, pins, summary).length, 6)
    rawMetrics.TaskDuration = NaN
    assert.throws(() => coverage(repo, pins, summary), /Invalid metric/)
    rawMetrics.TaskDuration = 1
    delete summary.stacks['react-mui']
    assert.throws(() => coverage(repo, pins, summary), /six dashboard/)
  }))

test('raw capture corruption fails instead of losing data', () => {
  const folder = mkdtempSync(join(tmpdir(), 'weft-style-raw-'))
  try {
    const raw = Buffer.from('{"traceEvents":[]}'),
      gz = gzipSync(raw)
    writeFileSync(join(folder, 'trace.gz'), gz)
    const record = {
      file: 'trace.gz',
      rawBytes: raw.length,
      gzipBytes: gz.length,
      rawSha256: digest(raw),
      gzipSha256: digest(gz),
    }
    assert.deepEqual(rawCapture(folder, record, 1024), { traceEvents: [] })
    assert.throws(() => rawCapture(folder, { ...record, rawSha256: 'bad' }, 1024), /hash mismatch/)
  } finally {
    rmSync(folder, { recursive: true, force: true })
  }
})

test('manager attribution restores witnessed assets on a failed hidden build', async () => {
  const repo = mkdtempSync(join(tmpdir(), 'weft-style-restore-'))
  try {
    mappedFixture(repo, 'unused')
    const stacks = STACKS.map((name) => ({ name })),
      expected = assetPins(repo, stacks)
    const dist = join(repo, 'benchmarks/compare/weft-warp/dist')
    await assert.rejects(
      preservingAssets(repo, stacks, expected, () => {
        writeFileSync(join(dist, 'app.js'), 'wrong build')
        writeFileSync(join(dist, 'extra.js'), 'extra')
        throw new Error('Planted hidden build failure')
      }),
      /Planted hidden build failure/,
    )
    assert.deepEqual(assetPins(repo, stacks), expected)
  } finally {
    rmSync(repo, { recursive: true, force: true })
  }
})
