// `/_weft/rt` over real HTTP on the fixture's dev server: the protocol a browser's reader speaks, the cursor a page
// carries, and a closed socket reaching the server. test/hub.test.ts covers the hub's decisions without a network.
import { inject } from 'vitest'
import { connect, frameId, pageCursor, rpc } from './rt-client.mjs'

const url = inject('url')

test("a mutation pokes a live query's tags over SSE", async () => {
  const counter = frameId(url, 'counter')
  const bump = frameId(url, 'bump')
  const c = await connect(url, { s: [[1, 'q', counter]] })
  await c.until('a')
  await rpc(url, bump)
  const poke = await c.until('p')
  expect(poke.t).toEqual(['counter'])
  c.close()
})

test('a topic message reaches a stream, and a resume replays what the client missed', async () => {
  const feed = frameId(url, 'noteFeed')
  const post = frameId(url, 'postNote')
  const a = await connect(url, { s: [[1, 's', feed]] })
  await a.until('h')
  await new Promise((ok) => {
    setTimeout(ok, 50)
  })
  await rpc(url, post, { text: 'one' })
  const [, cursor, first] = await a.until('m')
  expect(first).toEqual({ text: 'one' })
  a.close()
  await rpc(url, post, { text: 'two' })
  const b = await connect(url, { s: [[1, 's', feed, undefined, cursor]] })
  const [, , next] = await b.until('m')
  expect(next).toEqual({ text: 'two' })
  b.close()
})

test('adding to a connection in place answers 204; an unknown id 404', async () => {
  const counter = frameId(url, 'counter')
  const c = await connect(url, {})
  const { k } = await c.until('h')
  const res = await fetch(`${url}/_weft/rt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-weft': '1' },
    body: JSON.stringify({ k, s: [[9, 'q', counter]] }),
  })
  expect(res.status).toBe(204)
  expect((await c.until('a'))[0]).toBe(9)
  c.close()
  const gone = await fetch(`${url}/_weft/rt`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-weft': '1' },
    body: JSON.stringify({ k: 'nope' }),
  })
  expect(gone.status).toBe(404)
})

test("a page that reads `.live` carries the cursor; one that doesn't, doesn't", async () => {
  expect(await pageCursor(url, '/live')).toMatch(/^\w+:\d+$/)
  expect(await pageCursor(url, '/about')).toBeUndefined()
})

test('a client that goes away closes its connection on the server', async () => {
  const stats = frameId(url, 'rtStats')
  const read = async () =>
    (await fetch(`${url}/_weft/fn/${stats}`).then((r) => r.json())).v.connections
  const before = await read()
  const c = await connect(url, {})
  await c.until('h')
  expect(await read()).toBe(before + 1)
  c.close()
  await vi.waitFor(() => expect(read()).resolves.toBe(before), { timeout: 5000 })
})

test("Q009: a stream can't be called as a server function", async () => {
  const feed = frameId(url, 'noteFeed')
  expect((await fetch(`${url}/_weft/fn/${feed}`)).status).toBe(405)
})
