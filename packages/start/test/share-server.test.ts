// The server's half of `interaction({ share })`, over `attach` with a fake peer: access, batching, snapshots, leaving.
import type { Loose } from './loose'
import { AsyncLocalStorage } from 'node:async_hooks'
import { memoryBus, realtime } from '@weft-js/start'
import { configure, createHub, resetHub } from '@weft-js/start/hub'
import { runtime } from '@weft-js/start/data'
import { createScope } from '../src/exec'
import { attach } from '../src/socket'

const als = new AsyncLocalStorage<Loose>()
runtime.scope = () => als.getStore()
runtime.enter = (scope, fn) => als.run(scope, fn)

const wait = async (n = 6) => { for (let i = 0; i < n; i++) await new Promise(ok => { setTimeout(ok) }) }

async function client(ctx: object = {}, h?: Loose) {
  const frames: Loose[][] = []
  let closed = 0
  const peer = { send: (t: string) => void frames.push(JSON.parse(t)), close: (c: number) => void (closed = c), backlog: () => 0 }
  const r = new Request('http://app.test/_weft/ws')
  const a = await attach(peer, r, createScope(r, { context: () => ctx }), h)
  let ack = 0
  const c = {
    frames, a,
    get closed() { return closed },
    join: async () => { a.message(JSON.stringify(['j', 1, '$share'])); await wait() },
    say: async (name: string, msg: unknown) => { a.message(JSON.stringify(['m', 1, ++ack, name, msg])); await wait() },
    heard: () => frames.filter(f => f[0] === 'm' && f[3] === 'b').flatMap(f => f[4].s),
    ok: () => frames.filter(f => f[0] === 'm' && f[3] === 'ok').map(f => f[4]),
    refused: () => frames.filter(f => f[0] === 'e').map(f => f[2].code),
  }
  return c
}

afterEach(() => resetHub())

test('with no `realtime({ share })` the join is refused: never open by default', async () => {
  configure({})
  const a = await client()
  await a.join()
  expect(a.refused()).toEqual(['R011'])
})

test('a refused key is named back, can\'t be said, and is never heard', async () => {
  configure(realtime({ share: ({ key }) => !key.startsWith('secret:') }))
  const a = await client(), b = await client()
  await a.join()
  await b.join()
  await a.say('u', { add: ['open', 'secret:x'] })
  await b.say('u', { add: ['open', 'secret:x'] })
  expect(a.ok()[0].no).toEqual(['secret:x'])
  await a.say('set', { e: [['secret:x', 1], ['open', 1]] })
  expect(b.heard().map((t: Loose) => [t[1], t[2]])).toEqual([['open', 1]])
  // Nor can a key that was never asked for be spoken to.
  await a.say('set', { e: [['never', 1]] })
  expect(b.heard()).toHaveLength(1)
})

test('the rule sees the context, per key, and a throw is a no', async () => {
  const seen: string[] = []
  configure({ share: ({ ctx, key }: Loose) => { seen.push(`${ctx.user.id}:${key}`); if (key === 'boom') throw new Error('x'); return true } })
  const a = await client({ user: { id: 'u1' } })
  await a.join()
  await a.say('u', { add: ['a', 'boom'] })
  expect(seen).toEqual(['u1:a', 'u1:boom'])
  expect(a.ok()[0].no).toEqual(['boom'])
})

test('`{ keys }`: one call for a 200-row join and one at re-check, and what it leaves out is refused', async () => {
  const calls: string[][] = []
  let open = true
  configure({ share: { keys: ({ ctx, keys }: Loose) => { calls.push(keys); return open ? [...keys.filter((k: string) => k !== 'row:7'), 'never-asked', ctx.user.id] : [] } } })
  const keys = Array.from({ length: 200 }, (_, i) => `row:${i}`)
  const a = await client({ user: { id: 'u1' } })
  await a.join()
  await a.say('u', { add: keys })
  expect(calls).toHaveLength(1)
  expect(calls[0]).toEqual(keys)
  expect(a.ok()[0].no).toEqual(['row:7'])
  open = false
  await a.a.recheck()
  await wait()
  expect(calls).toHaveLength(2)
  expect(calls[1]).toHaveLength(199)
})

test('`{ keys }` that throws refuses the frame, and no frame of nothing asks at all', async () => {
  let n = 0
  configure({ share: { keys: () => { n++; throw new Error('db down') } } })
  const a = await client()
  await a.join()
  await a.say('u', { add: ['a', 'b'] })
  expect(n).toBe(1)
  expect(a.ok()[0].no).toEqual(['a', 'b'])
  await a.say('u', { drop: ['a'] })
  expect(n).toBe(1)
})

test('200 rows are one frame in, and a sweep is one frame out', async () => {
  configure({ share: () => true })
  const keys = Array.from({ length: 200 }, (_, i) => `row:${i}`)
  const a = await client(), b = await client()
  await a.join()
  await b.join()
  await a.say('u', { add: keys })
  await b.say('u', { add: keys })
  expect(a.closed + b.closed).toBe(0)
  const before = b.frames.length
  await a.say('set', { e: keys.map(k => [k, 1]) })
  await wait(10)
  const got = b.frames.slice(before).filter(f => f[3] === 'b')
  expect(got.flatMap(f => f[4].s)).toHaveLength(200)
  expect(got.length).toBeLessThanOrEqual(64)           // one per shard at the very most, whatever the row count
})

test('a joiner gets what is held, from nobody\'s socket: only holders, only its keys', async () => {
  configure({ share: () => true })
  const a = await client(), b = await client(), c = await client()
  await a.join()
  await b.join()
  await c.join()
  await a.say('u', { add: ['k', 'other'] })
  await a.say('set', { e: [['k', 3], ['other', 1]] })
  const sentBefore = a.frames.length
  await b.say('u', { add: ['k'] })
  await wait()
  expect(b.heard()).toEqual([[expect.any(String), 'k', 3]])
  expect(a.frames.slice(sentBefore).filter(f => f[3] === 'b')).toEqual([]) // holders are asked nothing
})

test('leaving clears: a closed socket says zero for exactly what it held', async () => {
  configure({ share: () => true })
  const a = await client(), b = await client()
  await a.join()
  await b.join()
  await a.say('u', { add: ['k', 'idle'] })
  await b.say('u', { add: ['k', 'idle'] })
  await a.say('set', { e: [['k', 1]] })
  a.a.close()
  await wait()
  expect(b.heard().map((t: Loose) => [t[1], t[2]])).toEqual([['k', 1], ['k', 0]])
})

test('dropping a key says zero for it, and nothing more arrives', async () => {
  configure({ share: () => true })
  const a = await client(), b = await client()
  await a.join()
  await b.join()
  await a.say('u', { add: ['k'] })
  await b.say('u', { add: ['k'] })
  await a.say('set', { e: [['k', 1]] })
  await a.say('u', { drop: ['k'] })
  await a.say('set', { e: [['k', 1]] })
  expect(b.heard().map((t: Loose) => t[2])).toEqual([1, 0])
})

test('a session re-check drops keys the rule no longer passes', async () => {
  let open = true
  configure({ share: () => open })
  const a = await client(), b = await client()
  await a.join()
  await b.join()
  await a.say('u', { add: ['k'] })
  await b.say('u', { add: ['k'] })
  await a.say('set', { e: [['k', 1]] })
  open = false
  await a.a.recheck()
  await wait()
  expect(a.ok().at(-1).no).toEqual(['k'])
  expect(b.heard().map((t: Loose) => t[2])).toEqual([1, 0])
})

test('the limits hold: bad bits and oversize batches are refused, and keys cap at `shareKeys`', async () => {
  configure({ share: () => true, limits: { shareKeys: 2 } })
  const a = await client()
  await a.join()
  await a.say('u', { add: ['a', 'b', 'c'] })
  expect(a.ok()[0].no).toEqual(['c'])
  await a.say('set', { e: [['a', 9]] })
  expect(a.frames.at(-1)![3].code).toBe('Q002')
  await a.say('u', { add: Array.from({ length: 401 }, (_, i) => `k${i}`) })
  expect(a.frames.at(-1)![3].code).toBe('Q002')
})

test('two instances on one bus: bits, a joiner\'s snapshot and a leave all cross', async () => {
  const bus = memoryBus()
  const one = createHub({ bus, share: () => true }), two = createHub({ bus, share: () => true })
  const a = await client({}, one), b = await client({}, two)
  await a.join()
  await b.join()
  await a.say('u', { add: ['k'] })
  await a.say('set', { e: [['k', 1]] })
  await b.say('u', { add: ['k'] })                     // joined after: the snapshot comes from the other instance
  await wait(10)
  expect(b.heard().map((t: Loose) => [t[1], t[2]])).toEqual([['k', 1]])
  await a.say('set', { e: [['k', 3]] })
  a.a.close()
  await wait(10)
  expect(b.heard().map((t: Loose) => t[2])).toEqual([1, 3, 0])
  await one.shutdown()
  await two.shutdown()
})
