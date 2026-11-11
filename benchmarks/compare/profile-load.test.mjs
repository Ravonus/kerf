// Small Node-only controls; no workspace build, Chromium launch, SSH or dependency install.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { execFileSync, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, existsSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  STACKS,
  requireSix,
  discoverStacks,
  balancedOrders,
  metricsFrom,
  traceAttribution,
  cpuAttribution,
  summarizeTrials,
} from './profile-load-data.mjs'
import { captureTrial, readTrace, serveAssets } from './profile-load-capture.mjs'
import { evidence, withLease, closeBrowser } from './profile-load-io.mjs'
import { hash, verifyBuild, assetPins } from './profile-load-pins.mjs'
import { options } from './profile-load.mjs'

const repo = fileURLToPath(new URL('../../', import.meta.url))
const raw = () => ({
  ScriptDuration: 0.01,
  RecalcStyleDuration: 0.005,
  LayoutDuration: 0.002,
  TaskDuration: 0.02,
  JSHeapUsedSize: 1048576,
  Nodes: 50,
  Timestamp: 100.1,
})
const temporary = (task) => {
  const folder = mkdtempSync(join(tmpdir(), 'T02-profile-'))
  return Promise.resolve()
    .then(() => task(folder))
    .finally(() => rmSync(folder, { recursive: true }))
}

test('six dashboards match Git; missing, duplicate or added stacks fail', (t) => {
  const disk = discoverStacks(repo).map((s) => s.name)
  const git = execFileSync('git', ['ls-files', 'benchmarks/compare/*/stack.json'], {
    cwd: repo,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
  assert.equal(disk.length, git.length)
  assert.equal(disk.length, 6)
  t.diagnostic(`Git dashboard coverage ${disk.length}/${git.length}`)
  assert.throws(() => requireSix(disk.slice(1)))
  assert.throws(() => requireSix([...disk, disk[0]]))
  assert.throws(() => requireSix([...disk.slice(1), 'unknown']))
})

test('Williams rows balance every position and predecessor, with paired reversals', () => {
  const orders = balancedOrders()
  assert.equal(orders.length, 12)
  for (let i = 0; i < orders.length; i += 2)
    assert.deepEqual(orders[i], [...orders[i + 1]].reverse())
  for (const stack of STACKS)
    for (let position = 0; position < 6; position++)
      assert.equal(orders.filter((row) => row[position] === stack).length, 2)
  const pairs = new Map()
  for (const row of orders)
    for (let i = 1; i < 6; i++) {
      const pair = row[i - 1] + ':' + row[i]
      pairs.set(pair, (pairs.get(pair) ?? 0) + 1)
    }
  assert.equal(pairs.size, 30)
  assert.ok([...pairs.values()].every((count) => count === 2))
  assert.equal(balancedOrders(2).length, 24)
  for (const bad of [0, 3, 1.5, NaN]) assert.throws(() => balancedOrders(bad))
})

test('canonical metric units are exact; missing/bad metrics and FCP fail', () => {
  assert.deepEqual(metricsFrom(raw(), 15), {
    scriptMs: 10,
    styleMs: 5,
    layoutMs: 2,
    taskMs: 20,
    heapMB: 1,
    nodes: 50,
    fcpMs: 15,
  })
  for (const key of Object.keys(raw())) {
    const missing = raw()
    delete missing[key]
    assert.throws(() => metricsFrom(missing, 15), /metric/)
    for (const bad of [NaN, Infinity, -1, '2'])
      assert.throws(() => metricsFrom({ ...raw(), [key]: bad }, 15))
  }
  for (const bad of [undefined, NaN, 0, -1]) assert.throws(() => metricsFrom(raw(), bad))
})

test('missing-stack and bad-metric controls really exit nonzero in standalone children', (t) => {
  const url = new URL('./profile-load-data.mjs', import.meta.url).href
  for (const expression of ['m.requireSix(["kerf-veneer"])', 'm.metricsFrom({}, 10)']) {
    const env = { ...process.env }
    delete env.NODE_TEST_CONTEXT
    const child = spawnSync(
      process.execPath,
      ['--input-type=module', '-e', `import * as m from ${JSON.stringify(url)};${expression}`],
      { env, encoding: 'utf8' },
    )
    assert.equal(child.status, 1, child.stdout + child.stderr)
    assert.match(child.stderr, /AssertionError/)
    t.diagnostic(
      JSON.stringify({ expression, exit: child.status, error: child.stderr.split('\n')[4] }),
    )
  }
})

const event = (name, ts, dur, extra = {}) => ({ ph: 'X', pid: 1, tid: 2, name, ts, dur, ...extra })
const trace = () => [
  { ph: 'M', pid: 1, tid: 2, name: 'thread_name', args: { name: 'CrRendererMain' } },
  event('RunTask', 0, 10000),
  event('EvaluateScript', 1000, 6000, {
    args: { data: { url: 'http://loop/app.js', frame: 'F' } },
  }),
  event('EvaluateScript', 2000, 1000, {
    args: { data: { url: 'http://loop/app.js', frame: 'F' } },
  }),
  { ph: 'B', pid: 1, tid: 2, name: 'ParseAuthorStyleSheet', ts: 7000 },
  { ph: 'E', pid: 1, tid: 2, ts: 9000 },
  event('Layout', 0, 999999, { pid: 9 }),
]

test('trace attribution identifies the renderer, clips the window and never adds nested time', () => {
  const result = traceAttribution(trace(), {
    origin: 'http://loop/',
    frame: 'F',
    start: 0,
    end: 8000,
  })
  assert.equal(result.thread, '1:2')
  assert.equal(result.busyCoveredMs, 8)
  const scripts = result.rows.find((row) => row.name === 'EvaluateScript')
  assert.equal(scripts.inclusiveMs, 7)
  assert.equal(scripts.coveredMs, 6)
  assert.equal(result.cssParsing[0].coveredMs, 1)
  assert.equal(
    result.rows.some((row) => row.name === 'Layout'),
    false,
  )
  assert.throws(() => traceAttribution([], { start: 0, end: 1 }))
  assert.throws(() =>
    traceAttribution(trace(), { origin: 'missing', frame: 'F', start: 0, end: 1 }),
  )
  assert.throws(() =>
    traceAttribution([...trace(), event('Bad', 2, -1)], {
      origin: 'http://loop/',
      frame: 'F',
      start: 0,
      end: 8000,
    }),
  )
})

test('CPU samples retain function/URL attribution and reject missing clocks or node ids', () => {
  const profile = {
    startTime: 1000,
    endTime: 4000,
    nodes: [{ id: 1, callFrame: { functionName: 'mount', url: 'app.js', lineNumber: 2 } }],
    samples: [1, 1],
    timeDeltas: [1000, 1000],
  }
  assert.equal(cpuAttribution(profile, 2500).rows[0].sampledMs, 0.5)
  assert.equal(cpuAttribution(profile, 2500).rows[0].url, 'app.js')
  assert.throws(() => cpuAttribution({ ...profile, samples: [999, 1] }, 2500))
  assert.throws(() => cpuAttribution({ ...profile, startTime: NaN }, 2500))
})

test('stream caps reject partial traces and still close the CDP handle', async () => {
  const calls = []
  const cdp = {
    send(method) {
      calls.push(method)
      return { data: '12345', eof: true }
    },
  }
  await assert.rejects(() => readTrace(cdp, 'owned', 4), /cap/)
  assert.deepEqual(calls, ['IO.read', 'IO.close'])
  assert.equal(String(await readTrace(cdp, 'owned', 5)), '12345')
})

function mockedCapture(fail = false, dataLoss = false) {
  const calls = [],
    cdp = new EventEmitter()
  let snapshots = 0,
    evaluations = 0
  cdp.send = (method, params) => {
    calls.push([method, params])
    if (method === 'Performance.getMetrics')
      return {
        metrics: Object.entries({ ...raw(), Timestamp: 100 + snapshots++ / 10 }).map(
          ([name, value]) => ({ name, value }),
        ),
      }
    if (method === 'Page.getFrameTree') return { frameTree: { frame: { id: 'F' } } }
    if (method === 'Profiler.stop') return { profile: { nodes: [] } }
    if (method === 'Tracing.end')
      cdp.emit('Tracing.tracingComplete', { stream: 'owned', dataLossOccurred: dataLoss })
    if (method === 'IO.read') return { data: '{"traceEvents":[]}', eof: true }
    return {}
  }
  const page = {
    setDefaultTimeout() {},
    on() {},
    goto() {
      if (fail) throw new Error('readiness failure')
    },
    getByText() {
      return {
        first() {
          return { waitFor() {} }
        },
      }
    },
    waitForTimeout(ms) {
      assert.equal(ms, 300)
    },
    evaluate() {
      return evaluations++ === 0 ? 15 : { elements: 20, text: 10, comments: 3 }
    },
  }
  const context = {
    newPage() {
      return page
    },
    newCDPSession() {
      return cdp
    },
    close() {
      calls.push(['context.close'])
    },
  }
  const browser = {
    newContext(settings) {
      assert.deepEqual(settings.viewport, { width: 1280, height: 800 })
      return context
    },
  }
  return { browser, calls, cdp }
}

test('capture uses canonical readiness/throttle and closes profilers/context on success or error', async () => {
  for (const [bad, dataLoss] of [
    [false, false],
    [true, false],
    [false, true],
  ]) {
    const fake = mockedCapture(bad, dataLoss)
    const result = await captureTrial(fake.browser, 'http://loop/')
    assert.equal(result.status, bad || dataLoss ? 'error' : 'ok')
    if (dataLoss) assert.ok(result.errors.some((error) => error.includes('trace data loss')))
    if (!bad) assert.ok(result.end > result.start)
    assert.ok(
      fake.calls.some(
        ([method, params]) => method === 'Emulation.setCPUThrottlingRate' && params.rate === 4,
      ),
    )
    for (const expected of ['Profiler.stop', 'Tracing.end', 'IO.close', 'context.close'])
      assert.ok(
        fake.calls.some(([method]) => method === expected),
        expected,
      )
    assert.equal(fake.cdp.listenerCount('Tracing.tracingComplete'), 0)
  }
})

test('pinned loopback server rejects changed/unlisted assets and releases its listener', () =>
  temporary(async (folder) => {
    const html = '<p>Apollo 0</p>'
    writeFileSync(join(folder, 'index.html'), html)
    const server = await serveAssets(folder, { 'index.html': { sha256: hash(html) } })
    try {
      assert.equal(await (await fetch(server.url)).text(), html)
      assert.equal((await fetch(server.url + 'missing.js')).status, 404)
      writeFileSync(join(folder, 'index.html'), 'changed')
      assert.equal((await fetch(server.url)).status, 404)
      assert.equal(server.errors.length, 2)
    } finally {
      await server.close()
    }
    await assert.rejects(() => fetch(server.url))
  }))

test('fresh evidence directories, decoded caps and lease cleanup cannot silently overwrite', () =>
  temporary(async (folder) => {
    const out = join(folder, 'evidence'),
      log = evidence(out)
    log.json('one.json', { ok: true })
    assert.throws(() => log.json('one.json', {}), /EEXIST/)
    assert.throws(() => evidence(out), /EEXIST/)
    assert.throws(() => log.compressed('bad.gz', Buffer.from('123'), 2), /cap/)
    await assert.rejects(
      () =>
        withLease(folder, async () => {
          await assert.rejects(() => withLease(folder, () => {}), /EEXIST/)
          throw new Error('control')
        }),
      /control/,
    )
    assert.equal(existsSync(join(folder, '.profile-load-lease')), false)
  }))

test('browser cleanup kills only the owned server even when graceful closure fails', async () => {
  const calls = []
  await assert.rejects(
    () =>
      closeBrowser(
        {
          close() {
            throw new Error('close failure')
          },
        },
        {
          kill() {
            calls.push('owned kill')
          },
        },
      ),
    /close failure/,
  )
  assert.deepEqual(calls, ['owned kill'])
})

test('build proof rejects changed assets, pins and failed commands', () => {
  const assets = Object.fromEntries(STACKS.map((name) => [name, {}]))
  const proof = {
    kind: 'profile-load-build-v1',
    pins: { tree: 'one' },
    assets,
    commands: STACKS.map((stack) => ({ stack, exit: 0, signal: null })),
  }
  verifyBuild(proof, { tree: 'one' }, assets)
  assert.throws(() => verifyBuild(proof, { tree: 'changed' }, assets), /mismatch/)
  assert.throws(() => verifyBuild(proof, proof.pins, {}))
  assert.throws(() => verifyBuild({ ...proof, commands: [] }, proof.pins, assets))
  assert.throws(() =>
    verifyBuild(
      { ...proof, commands: proof.commands.map((c) => ({ ...c, exit: 1 })) },
      proof.pins,
      assets,
    ),
  )
})

test('prebuilt asset pins require a complete ordinary dashboard, not a missing dist', () =>
  temporary((folder) => {
    assert.throws(() => assetPins(folder, [{ name: 'kerf-veneer' }]), /Missing built/)
    const dist = join(folder, 'benchmarks/compare/kerf-veneer/dist')
    mkdirSync(dist, { recursive: true })
    writeFileSync(join(dist, 'index.html'), 'index')
    assert.throws(() => assetPins(folder, [{ name: 'kerf-veneer' }]), /Missing JS/)
    writeFileSync(join(dist, 'app.js'), 'const mounted = true')
    assert.equal(Object.keys(assetPins(folder, [{ name: 'kerf-veneer' }])['kerf-veneer']).length, 2)
  }))

test('summary rejects missing stack/trial/metric rather than publishing partial comparisons', () => {
  const trials = Object.fromEntries(
    STACKS.map((name) => [
      name,
      Array.from({ length: 12 }, () => ({ status: 'ok', metrics: metricsFrom(raw(), 15) })),
    ]),
  )
  assert.equal(summarizeTrials(trials)['kerf-veneer'].summary.taskMs.median, 20)
  assert.throws(() => summarizeTrials({ ...trials, 'kerf-veneer': [] }), /coverage/)
  const missing = structuredClone(trials)
  delete missing['kerf-veneer'][0].metrics.scriptMs
  assert.throws(() => summarizeTrials(missing), /Missing summary/)
})

test('CLI options are bounded, position independent and reject duplicates', () => {
  assert.equal(options(['--out', 'owned', '--cycles', '2']).cycles, 2)
  assert.throws(() => options(['--out', 'one', '--out', 'two']), /Duplicate/)
  assert.throws(() => options(['--out', 'one', '--cycles', '3']))
  assert.throws(() => options(['--unknown', 'value']))
})
