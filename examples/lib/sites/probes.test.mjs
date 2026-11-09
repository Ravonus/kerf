import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import net from 'node:net'
import test from 'node:test'
import { createProxy } from '../../shared/pg/latency-proxy.mjs'
import { splitHtml, ttfbPass } from '../flow.mjs'
import { mismatch, parseList } from '../race.mjs'
import { shuffled } from '../race/probes.mjs'

test('markup and embedded data split at inline scripts; a script with src is markup', () => {
  const s = splitHtml(
    '<head><script src="/a.js"></script></head><body><p>hi</p><script>self.x=[1,2]</script><script type="application/json">{"a":1}</script></body>',
  )
  assert.equal(s.data.raw, 'self.x=[1,2]{"a":1}'.length)
  assert.ok(s.html.raw > 0 && s.html.br > 0)
  assert.equal(splitHtml('<p>none</p>').data.br, 0)
})

test('first byte and the </head> byte are told apart, even split across chunks', async () => {
  const s = createServer((q, r) => {
    r.writeHead(200)
    r.write('<html><head></he')
    setTimeout(() => {
      r.write('ad>')
      setTimeout(() => r.end('</html>'), 5)
    }, 60)
  })
  await new Promise((ok) => s.listen(0, '127.0.0.1', ok))
  const t = await ttfbPass(`http://127.0.0.1:${s.address().port}/`, {
    connections: 1,
    seconds: 0.2,
  })
  s.close()
  assert.ok(t.p50 < 40, `first byte ${t.p50}`)
  assert.ok(t.head >= 55, `head ${t.head}`)
})

test('the accessibility tree reads as title and state; a difference is named', () => {
  const rows = parseList(
    '- list "Todos":\n  - listitem:\n    - checkbox "Say \\"hi\\"" [checked]\n    - button "Delete"\n  - listitem:\n    - checkbox "Two"\n',
  )
  assert.deepEqual(rows, [
    { title: 'Say "hi"', done: true },
    { title: 'Two', done: false },
  ])
  assert.equal(mismatch(rows, [...rows].reverse()), null)
  assert.deepEqual(mismatch(rows, [{ title: 'Two', done: true }]).database, ['[x] Two'])
  const twice = [
    { title: 'a', done: false },
    { title: 'a', done: false },
  ]
  assert.deepEqual(mismatch(twice, twice.slice(1)).screen, ['[ ] a'])
})

test('a shuffle is a permutation, and the seed replays it', () => {
  assert.deepEqual(shuffled(8, 7), shuffled(8, 7))
  assert.notDeepEqual(shuffled(8, 7), shuffled(8, 8))
  assert.deepEqual(
    [...shuffled(8, 7)].sort((a, b) => a - b),
    [0, 1, 2, 3, 4, 5, 6, 7],
  )
})

test('the proxy delays each way, counts turns, and frames queries across chunks', async () => {
  const echo = net.createServer((c) => c.on('data', (d) => c.write(d)).on('error', () => {})) // proxy.close() is a reset on Windows
  await new Promise((ok) => echo.listen(0, '127.0.0.1', ok))
  const proxy = createProxy({ port: echo.address().port, rtt: 40 }),
    port = await proxy.listen()
  const c = net.connect(port, '127.0.0.1')
  await new Promise((ok) => c.once('connect', ok))
  const ask = (b) =>
    new Promise((ok) => {
      const t = performance.now()
      c.once('data', () => ok(performance.now() - t))
      c.write(b)
    })
  const startup = Buffer.alloc(8)
  startup.writeInt32BE(8, 0)
  startup.writeInt32BE(196608, 4)
  assert.ok((await ask(startup)) >= 39)
  const query = Buffer.from('Q\0\0\0\x0bselect\0'),
    half = query.subarray(0, 3),
    rest = query.subarray(3)
  c.write(half)
  await new Promise((r) => setTimeout(r, 20))
  await ask(rest)
  await ask(query)
  const s = proxy.stats()
  assert.equal(s.queries, 2)
  assert.equal(s.roundTrips, 3)
  assert.equal(s.peak, 1)
  c.destroy()
  await proxy.close()
  echo.close()
})
