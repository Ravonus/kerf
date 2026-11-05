// The runtime matrix's channel check (research 32): a real WebSocket through each runtime's server, on a built app.
//
//   node packages/start/test/e2e/e2e-realtime.mjs prepare <dir>     (the same app has the chat fixture)
//   node packages/start/scripts/runtime-matrix.mjs <dir> --e2e packages/start/test/e2e/e2e-channels.mjs
import { fnId, handshake, open } from '../ws-client.mjs'
import { rpc } from '../rt-client.mjs'

export default async function run({ url, log }) {
  const checks = []
  const check = (name, ok, detail) => {
    if (!ok) throw new Error(`${name}: ${JSON.stringify(detail)}`)
    checks.push(name)
    log(`ok ${name}`)
  }
  const room = fnId('room'),
    counter = fnId('counter')
  const roomId = `r${Date.now()}`

  check('no Upgrade header is 426', (await fetch(`${url}/_weft/ws`)).status === 426)
  check(
    'another Origin is refused',
    (await handshake(url, { origin: 'http://evil.example' })) === 403,
  )
  check('no Origin is refused', (await handshake(url)) === 403)
  check(
    'the same host on another port is refused',
    (await handshake(url, { origin: url.replace(/:\d+$/, ':1') })) === 403,
  )
  check(
    "the app's own Origin upgrades",
    (await handshake(url, { origin: new URL(url).origin })) === 101,
  )

  const a = await open(url),
    b = await open(url)
  const hello = (await a.until('h'))[1]
  await b.until('h')
  check('hello names the connection and the build', hello.k && hello.e !== undefined, hello)
  a.send('j', 1, room, { roomId })
  b.send('j', 7, room, { roomId })
  const joined = await a.until('j')
  await b.until('j')
  check('a join answers with a cursor', /^\w+:\d+$/.test(joined[2]), joined)

  a.send('m', 1, 1, 'say', { text: 'one' })
  check('the sender gets its ack', (await a.until('a'))[3] === undefined)
  const got = await b.until('m')
  check('the other client gets the message', got[4].text === 'one', got)
  await a.until('m')

  await rpc(url, fnId('postToRoom'), { roomId, text: 'two' })
  check('a mutation can publish to a room', (await b.until('m'))[4].text === 'two')
  const last = (await a.until('m'))[2]

  a.send('m', 1, 2, 'say', { text: 5 })
  const bad = await a.until('a')
  check('a bad message is refused and nothing fans out', bad[3]?.code === 'Q002', bad)

  a.send('m', 1, 3, 'constructor', {})
  check('a message named `constructor` finds nothing', (await a.until('a'))[3]?.code === 'Q002')

  a.close()
  await a.shut()
  await rpc(url, fnId('postToRoom'), { roomId, text: 'missed' })
  await b.until('m')
  const c = await open(url)
  await c.until('h')
  c.send('j', 1, room, { roomId }, last)
  await c.until('j')
  check('a rejoin with a cursor replays what it missed', (await c.until('m'))[4].text === 'missed')

  const d = await open(url)
  await d.until('h')
  d.send('j', 1, room, { roomId }, 'gone:1')
  await d.until('j')
  check('a cursor from another epoch is a reset', (await d.until('r'))[1] === 1)

  await finishChannels({ url, check, room, roomId, counter, b, c, d })
  return { checks }
}

async function finishChannels({ url, check, room, roomId, counter, b, c, d }) {
  const key = { id: roomId }
  c.send('j', 2, counter, key)
  d.send('j', 2, counter, key)
  await c.until((f) => f[0] === 'j' && f[1] === 2)
  await d.until((f) => f[0] === 'j' && f[1] === 2)
  c.send('m', 2, 9, '$set', { n: 3 })
  await c.until('a')
  check(
    'a shared value reaches the other client',
    (await d.until((f) => f[3] === '$v'))[4].v.n === 3,
  )
  const e = await open(url)
  await e.until('h')
  e.send('j', 1, counter, key)
  check('a later join is told the value', (await e.until((f) => f[3] === '$v'))[4].v.n === 3)

  await rpc(url, fnId('ban'), { roomId })
  const f = await open(url)
  await f.until('h')
  f.send('j', 1, room, { roomId })
  check('`authorize` refusing is R011', (await f.until('e'))[2].code === 'R011')

  f.raw('not json')
  check('junk closes the socket', (await f.shut()) === 1007)
  const g = await open(url)
  await g.until('h')
  g.raw(JSON.stringify(['m', 1, 1, 'say', 'x'.repeat(70_000)]))
  check('an oversized frame closes the socket', (await g.shut()) === 1009)
  const h = await open(url)
  await h.until('h')
  for (let i = 0; i < 60; i++) h.send('x')
  check('over the rate limit closes the socket', (await h.shut()) === 1008)
  for (const s of [b, c, d, e]) s.close()
}
