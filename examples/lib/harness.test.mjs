// node --test examples/lib: the parts of the harness a wrong result would hide in.
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { createServer } from 'node:http'
import { test } from 'node:test'
import { detect } from './app.mjs'
import { assertFresh } from './serve.mjs'
import { compare, spread } from './stats.mjs'

const sha = (s) => createHash('sha256').update(s).digest('hex')
const serve = (routes) =>
  new Promise((ok) => {
    const s = createServer((q, r) => {
      const b = routes[q.url]
      r.writeHead(b === undefined ? 404 : 200)
      r.end(b ?? '')
    }).listen(0, '127.0.0.1', () => ok(s))
  })
const handle = (s) => ({
  url: `http://127.0.0.1:${s.address().port}`,
  alive: () => true,
  seen: new Map(),
})
const variant = {
  name: 'v',
  canary: '__bench-run1.txt',
  fresh: { hashes: new Set([sha('new code')]) },
  log: 'x',
}

test('a server from an older run is refused by the canary', async () => {
  const s = await serve({ '/__bench-run0.txt': 'run0' })
  await assert.rejects(assertFresh(variant, handle(s)), /STALE/)
  s.close()
})

test('an asset the build did not write is refused, a fresh one passes', async () => {
  const s = await serve({ '/__bench-run1.txt': 'run1', '/a.js': 'new code', '/b.js': 'old code' }),
    h = handle(s)
  assert.equal((await assertFresh(variant, h, ['/a.js'])).verified, 1)
  await assert.rejects(assertFresh(variant, h, ['/b.js']), /STALE/)
  s.close()
})

test('overlapping samples are a tie however far the medians are', () => {
  assert.equal(
    compare('mobile.lcp', { med: 1000, min: 900, max: 1500 }, { med: 1400, min: 1200, max: 1600 })
      .verdict,
    'tie',
  )
  assert.equal(
    compare('mobile.lcp', { med: 1000, min: 950, max: 1050 }, { med: 1400, min: 1200, max: 1600 })
      .verdict,
    'win',
  )
  assert.equal(
    compare('server.rps', { med: 900, min: 850, max: 950 }, { med: 1400, min: 1200, max: 1600 })
      .verdict,
    'loss',
  )
})

test('a gap under the metric floor is a tie even with no spread', () => {
  assert.equal(
    compare('bytes.js.br', { med: 100, min: 100, max: 100 }, { med: 200, min: 200, max: 200 })
      .verdict,
    'tie',
  )
})

test('spread drops holes', () =>
  assert.deepEqual(spread([3, null, 1, 2]), { med: 2, min: 1, max: 3, n: 3 }))

test('the most specific stack wins', () => {
  assert.equal(
    detect({ dependencies: { '@kerf/core': '1', '@kerf/veneer': '1' } }).id,
    'kerf+veneer',
  )
  assert.equal(detect({ dependencies: { react: '1', next: '1' } }).id, 'next')
  assert.equal(
    detect({ dependencies: { 'solid-js': '1', '@solidjs/start': '1' } }).id,
    'solidstart',
  )
})
