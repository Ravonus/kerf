// The hub and `/_weft/rt` without a server: rings and cursors, backpressure, limits, the Origin check and the bus
// contract. What a sink does, a real connection does; test/rt.test.mjs runs the same protocol over HTTP.
import { AsyncLocalStorage } from 'node:async_hooks'
import { channel, memoryBus, mutation, query, realtime, StartError, stream, topic, tracked } from '@weft/start'
import { configure, hub, resetHub, rtRoute, type Sink } from '@weft/start/hub'
import { postgresBus } from '@weft/start/bus/postgres'
import { attach, socketRoute } from '../src/socket'
import { createScope, fetchQuery, liveQueries, runMutation } from '../src/exec'
import { currentScope, enter, fns, runtime } from '@weft/start/data'

// What server.tsx sets: the request scope, found through AsyncLocalStorage.
const als = new AsyncLocalStorage<any>()
runtime.scope = () => als.getStore()
runtime.enter = (scope, fn) => als.run(scope, fn)

const json = { 'content-type': 'application/json', 'x-weft': '1' }
const request = (body: unknown, headers: Record<string, string> = json) => new Request('http://app.test/_weft/rt', { method: 'POST', headers, body: JSON.stringify(body) })

function sink(backlog = () => 0) {
  const frames: [string, any][] = []
  const s: Sink & { frames: [string, any][]; closed: boolean } = { frames, closed: false, write: (e, d) => void frames.push([e, JSON.parse(d)]), backlog, close() { s.closed = true } }
  return s
}
const open = async (body: any, s = sink(), ctx: object = {}) => {
  const r = request(body)
  const c = await hub().connect(r, createScope(r, { context: () => ctx, dev: true }), body, s)
  return { c, s }
}
const of = (s: { frames: [string, any][] }, e: string) => s.frames.filter(f => f[0] === e).map(f => f[1])
const wait = () => new Promise(ok => setTimeout(ok))
const bare: any = { '~standard': { version: 1, vendor: 't', validate: (v: unknown) => ({ value: v }) } }

afterEach(async () => {
  await resetHub()
  liveQueries.clear()
})

const q = query({ $id: 'hub.q', tags: ['a', 'b'], run: () => 1 })
const t = topic('hub', { message: { '~standard': { version: 1, vendor: 't', validate: v => ({ value: v }) } } as any })
const feed = stream({ $id: 'hub.feed', async *run({ signal, lastEventId }) { yield* t.subscribe('k', { signal, after: lastEventId }) } })
void q

describe('pokes', () => {
  test('a connection gets the tags it subscribed to, by name, with a cursor', async () => {
    const { s } = await open({ s: [[1, 'q', 'hub.q']] })
    expect(of(s, 'a')).toEqual([[1, ['a', 'b']]])
    await hub().poke(['a', 'zzz'])
    await wait()
    expect(of(s, 'p')).toEqual([{ t: ['a'], c: expect.stringMatching(/^\w+:1$/) }])
  })

  test('the connection a mutation came from is skipped', async () => {
    const { c, s } = await open({ s: [[1, 'q', 'hub.q']] })
    await hub().poke(['a'], c.k)
    await wait()
    expect(of(s, 'p')).toEqual([])
  })

  test('a resume replays what it missed; a foreign cursor is a reset', async () => {
    const { s } = await open({ s: [[1, 'q', 'hub.q']] })
    const from = of(s, 'h')[0].c
    await hub().poke(['a'])
    await hub().poke(['b'])
    await wait()
    const back = await open({ c: from, s: [[1, 'q', 'hub.q']] })
    expect(of(back.s, 'p').map(p => p.t)).toEqual([['a'], ['b']])
    expect(of(back.s, 'R')).toEqual([])
    const other = await open({ c: 'elsewhere:3', s: [[1, 'q', 'hub.q']] })
    expect(of(other.s, 'R')).toHaveLength(1)
  })

  test('a cursor older than the ring is a reset', async () => {
    configure({ limits: { ring: 2 } })
    const { s } = await open({ s: [[1, 'q', 'hub.q']] })
    const from = of(s, 'h')[0].c
    for (const x of ['a', 'b', 'a']) await hub().poke([x])
    await wait()
    expect(of((await open({ c: from, s: [[1, 'q', 'hub.q']] })).s, 'R')).toHaveLength(1)
  })

  test('a gap on the bus resets every connection and moves the floor', async () => {
    let gap!: () => void
    const bus = memoryBus()
    configure({ bus: { ...bus, subscribe: (ch, on, g) => (ch === 'weft:poke' && (gap = g!), bus.subscribe(ch, on)) } })
    const { s } = await open({ s: [[1, 'q', 'hub.q']] })
    gap()
    expect(of(s, 'R')).toHaveLength(1)
  })

  test('held pokes merge by tag', async () => {
    let backlog = 0
    const { c, s } = await open({ s: [[1, 'q', 'hub.q']] }, sink(() => backlog))
    backlog = 1 << 20
    await hub().poke(['a'])
    await hub().poke(['b'])
    await hub().poke(['a'])
    await wait()
    expect(of(s, 'p')).toEqual([])
    backlog = 0
    hub().drain(c)
    expect(of(s, 'p').map(p => p.t)).toEqual([['a', 'b']])
  })

  test('W053: the hub reports a live query with no tags', async () => {
    query({ $id: 'hub.none', run: () => 1 })
    const seen: string[] = []
    const r = request({})
    await hub().connect(r, createScope(r, { dev: true, onDiagnostic: d => seen.push(d.code) }), { s: [[1, 'q', 'hub.none']] }, sink())
    expect(seen).toEqual(['W053'])
  })
})

describe('streams', () => {
  const messages = (s: { frames: [string, any][] }) => of(s, 'm').map(m => m[2])

  test('a topic message reaches a stream with a resumable cursor', async () => {
    const { s } = await open({ s: [[1, 's', 'hub.feed', undefined]] })
    await wait()
    await t.publish('k', 'one')
    await wait()
    expect(of(s, 'm')).toEqual([[1, expect.stringMatching(/:\d+$/), 'one']])
  })

  test('adding a subscription doesn\'t restart another\'s run', async () => {
    let runs = 0
    stream({ $id: 'hub.count', async *run({ signal }) { runs++; while (!signal.aborted) await wait(); yield 0 } })
    const { c } = await open({ s: [[1, 's', 'hub.count']] })
    await wait()
    await hub().change(c, request({}), { dev: true }, { s: [[2, 'q', 'hub.q']] })
    await wait()
    expect(runs).toBe(1)
  })

  test('a resume in the window replays, out of it the run restarts without a cursor', async () => {
    const seen: (string | undefined)[] = []
    stream({ $id: 'hub.resume', async *run({ signal, lastEventId }) { seen.push(lastEventId); yield* t.subscribe('r', { signal, after: lastEventId }) } })
    const a = await open({ s: [[1, 's', 'hub.resume']] })
    await wait()
    await t.publish('r', 1)
    await wait()
    const cursor = of(a.s, 'm')[0][1]
    hub().close(a.c)
    await t.publish('r', 2)
    await wait()
    const b = await open({ s: [[1, 's', 'hub.resume', undefined, cursor]] })
    await wait()
    expect(messages(b.s)).toEqual([2])
    const c = await open({ s: [[1, 's', 'hub.resume', undefined, 'elsewhere:1']] })
    await wait()
    expect(of(c.s, 'r')).toEqual([[1]])
    expect(seen).toEqual([undefined, cursor, 'elsewhere:1', undefined])
  })

  test('latest value by default when the client is slow; the held message goes out on drain', async () => {
    let backlog = 0
    const { c, s } = await open({ s: [[1, 's', 'hub.feed']] }, sink(() => backlog))
    await wait()
    backlog = 1 << 20
    for (const x of [1, 2, 3]) await t.publish('k', x)
    await wait()
    expect(messages(s)).toEqual([])
    backlog = 0
    hub().drain(c)
    expect(messages(s)).toEqual([3])
  })

  test('with `buffer`, messages are kept; an overflow resets the stream', async () => {
    let backlog = 0
    const { c, s } = await open({ s: [[1, 's', 'hub.feed', undefined, undefined, 2]] }, sink(() => backlog))
    await wait()
    backlog = 1 << 20
    for (const x of [1, 2]) await t.publish('k', x)
    await wait()
    backlog = 0
    hub().drain(c)
    expect(messages(s)).toEqual([1, 2])
    backlog = 1 << 20
    for (const x of [3, 4, 5]) await t.publish('k', x)
    await wait()
    expect(of(s, 'r')).toEqual([[1]])
  })

  test('a connection over `queue` bytes gets a bye and closes', async () => {
    configure({ limits: { queue: 8 } })
    let backlog = 0
    const { s } = await open({ s: [[1, 's', 'hub.feed']] }, sink(() => backlog))
    await wait()
    backlog = 1 << 20
    await t.publish('k', 'a message over eight bytes')
    await wait()
    expect(of(s, 'b')).toEqual([{ retry: 0 }])
    expect(s.closed).toBe(true)
  })

  test('tracked ids go through a plain handler too', async () => {
    stream({ $id: 'hub.rows', async *run() { yield tracked('row-9', 'x') } })
    const { s } = await open({ s: [[1, 's', 'hub.rows']] })
    await wait()
    expect(of(s, 'm')).toEqual([[1, 'row-9', 'x']])
    expect(of(s, 'f')).toEqual([[1]])
  })

  test('R006: a run that reads the database before it subscribes', async () => {
    stream({ $id: 'hub.late', async *run({ signal }) {
      currentScope().touched.read.add('msgs') // what the driver records for a select
      yield* t.subscribe('late', { signal })
    } })
    const seen: string[] = []
    const body = { s: [[1, 's', 'hub.late']] } as any
    const r = request(body)
    await hub().connect(r, createScope(r, { dev: true, onDiagnostic: d => seen.push(d.code) }), body, sink())
    await wait()
    expect(seen).toEqual(['R006'])
  })
})

describe('limits', () => {
  test('R008: a message over the limit', async () => {
    configure({ limits: { message: 4 } })
    await expect(t.publish('k', 'too long')).rejects.toThrow(/R008/)
  })

  test('R009: too many subscriptions, and too many connections for a user', async () => {
    configure({ limits: { subscriptions: 1, connections: 1 } })
    const { s } = await open({ s: [[1, 'q', 'hub.q'], [2, 'q', 'hub.q']] }, sink(), { user: { id: 'u' } })
    expect(of(s, 'e')[0][1].code).toBe('R009')
    await expect(open({}, sink(), { user: { id: 'u' } })).rejects.toThrow(/R009/)
  })

  test('the session re-check ends an `auth` subscription when the user is gone', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    configure({ limits: { heartbeat: 10, session: 10 } })
    stream({ $id: 'hub.mine', auth: 'user', async *run({ signal }) { while (!signal.aborted) await wait(); yield 0 } })
    let ctx: object = { user: { id: 'u' } }
    const body = { s: [[1, 's', 'hub.mine']] }
    const r = request(body)
    const s = sink()
    await hub().connect(r, createScope(r, { context: () => ctx, dev: true }), body as any, s)
    await wait()
    ctx = { user: null }
    vi.advanceTimersByTime(10)
    vi.useRealTimers()
    await wait()
    expect(of(s, 'e')[0][1].code).toBe('A002')
  })

  test('`maxDuration` ends a connection 10 s early, with a bye: the client resumes at once', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    configure({ maxDuration: 300 })
    const { s } = await open({})
    vi.advanceTimersByTime(289_000)
    expect(s.closed).toBe(false)
    vi.advanceTimersByTime(1_000)
    vi.useRealTimers()
    expect(of(s, 'b')).toEqual([{ retry: 0 }])
    expect(s.closed).toBe(true)
  })

  test('R004: a wildcard origin refuses to start', () => {
    expect(() => realtime({ origins: ['*'] })).toThrow(StartError)
  })
})

describe('a bus that fails', () => {
  const down = (): any => ({ name: 'down', publish: async () => { throw new Error('bus down') }, subscribe: async () => { throw new Error('bus down') } })

  test('making the hub reaches no bus: `weft build` loads this with nothing to connect to', () => {
    let subscribed = 0
    configure({ bus: { ...down(), subscribe: async () => (subscribed++, () => {}) } })
    expect(subscribed).toBe(0)
  })

  test('opening a connection fails, and the next try starts over', async () => {
    let ok = false
    const bus = memoryBus()
    configure({ bus: { ...bus, subscribe: (c, on) => (ok ? bus.subscribe(c, on) : Promise.reject(new Error('bus down'))) } })
    await expect(open({})).rejects.toThrow('bus down')
    expect(hub().stats().connections).toBe(0)
    ok = true
    const { s } = await open({})
    expect(of(s, 'h')).toHaveLength(1)
  })

  test('a mutation still succeeds when its poke can\'t go out', async () => {
    configure({ bus: down() })
    runtime.poke = (tags, origin) => hub().poke(tags, origin)
    const seen: string[] = []
    const m = mutation({ $id: 'hub.m', invalidates: ['x'], run: () => 'done' })
    const a = await runMutation(createScope(request({}), { onDiagnostic: d => seen.push(d.code) }), fns.get(m.$id)!, undefined, [])
    expect(a.v).toBe('done')
    expect(seen).toEqual(['E_RT'])
    runtime.poke = undefined
  })
})

describe('/_weft/rt', () => {
  const answer = (body: unknown, headers?: Record<string, string>, origins?: string[]) => {
    const r = request(body, headers)
    return rtRoute(r, createScope(r), origins)
  }

  test('R010: another origin is refused, unless it\'s listed', async () => {
    expect((await answer({}, { ...json, origin: 'http://evil.test' })).status).toBe(403)
    const ok = await answer({}, { ...json, origin: 'http://ok.test', 'sec-fetch-site': 'cross-site' }, ['http://ok.test'])
    expect(ok.status).toBe(200)
    await ok.body!.cancel()
  })

  test('a slow reader over real streams: held at the high-water mark, the latest wins', async () => {
    const res = await answer({ s: [[1, 's', 'hub.feed']] })
    const reader = res.body!.getReader()
    await reader.read() // hello
    await wait()
    for (const x of [1, 2, 3, 4]) await t.publish('k', `${x}`.repeat(40_000))
    await wait()
    let text = ''
    for (; !/"4{40000}"/.test(text); ) text += new TextDecoder().decode((await reader.read()).value)
    expect(text.match(/event: m/g)).toHaveLength(3) // 1 and 2 were written; 3 was replaced while held
    await reader.cancel()
  })

  test('Q002: a body of the wrong shape', async () => {
    for (const body of [null, [], { s: 'x' }, { s: [[1]] }, { d: ['a'] }]) expect((await answer(body)).status).toBe(400)
  })

  test('Q010: without the CSRF proof', async () => {
    expect((await answer({}, { 'content-type': 'application/json' })).status).toBe(403)
  })

  test('R008: a body over 64 KiB', async () => {
    expect((await answer({ x: 'y'.repeat(70_000) })).status).toBe(413)
  })

  test('an unknown connection is a 404: the client reconnects with the whole set', async () => {
    expect((await answer({ k: 'gone' })).status).toBe(404)
  })

  test('the response is SSE, unbuffered, and cancelling it closes the connection', async () => {
    const res = await answer({ s: [[1, 'q', 'hub.q']] })
    expect(res.headers.get('content-type')).toBe('text/event-stream')
    expect(res.headers.get('x-accel-buffering')).toBe('no')
    const reader = res.body!.getReader()
    const text = new TextDecoder().decode((await reader.read()).value)
    expect(text).toMatch(/^event: h\ndata: \{/)
    expect(hub().stats().connections).toBe(1)
    await reader.cancel()
    expect(hub().stats().connections).toBe(0)
  })
})

test('R003: a mutation writes a table a live query reads, and pokes none of its tags', async () => {
  const seen: string[] = []
  const reader = query({ $id: 'hub.reader', tags: ['rows'], run: () => { currentScope().touched.read.add('rows'); return 1 } })
  const write = mutation({ $id: 'hub.write', invalidates: ['other'], run: () => { currentScope().touched.write.add('rows') } })
  const scope = createScope(request({}), { dev: true, onDiagnostic: d => seen.push(d.code) })
  liveQueries.set(reader.$id, ['rows'])
  await fetchQuery(scope, fns.get(reader.$id)!, undefined)
  await runMutation(scope, fns.get(write.$id)!, undefined, [])
  expect(seen).toContain('R003')
})

describe.skipIf(!process.env.WEFT_TEST_POSTGRES)('postgres bus', () => {
  const url = process.env.WEFT_TEST_POSTGRES!

  test('two instances: a message crosses, in order, and a long one survives NOTIFY\'s limit', async () => {
    const a = postgresBus({ url }), b = postgresBus({ url })
    const got: string[] = []
    const stop = await b.subscribe('c', m => got.push(m))
    const long = 'é'.repeat(20_000)
    await a.publish('c', 'one')
    await a.publish('c', long)
    await a.publish('other', 'not this')
    await a.publish('c', 'three')
    await vi.waitFor(() => expect(got).toHaveLength(3))
    expect(got).toEqual(['one', long, 'three'])
    stop()
    await a.close!()
    await b.close!()
  })

  test('through two hubs: a poke from one reaches a connection on the other', async () => {
    const bus = postgresBus({ url })
    configure({ bus })
    const { s } = await open({ s: [[1, 'q', 'hub.q']] })
    const other = postgresBus({ url })
    await other.publish('weft:poke', JSON.stringify({ t: ['a'] }))
    await vi.waitFor(() => expect(of(s, 'p')).toHaveLength(1))
    await other.close!()
  })
})

describe('channels on the hub', () => {
  test('R004: a wildcard anywhere in an origin', () => {
    expect(() => realtime({ origins: ['https://*.example.com'] })).toThrow('R004')
    expect(() => realtime({ origins: ['*'] })).toThrow('R004')
    expect(() => realtime({ origins: ['https://a.example'] })).not.toThrow()
  })

  test('R004 again at the upgrade, for an app that skipped `realtime()`', async () => {
    const r = new Request('http://app.test/_weft/ws', { headers: { upgrade: 'websocket', origin: 'http://app.test' } })
    const seen: string[] = []
    const res: any = await socketRoute(r, createScope(r, { onDiagnostic: d => seen.push(d.code) }), ['*'])
    expect(seen).toEqual(['R004'])
    expect(() => res.crossws.upgrade()).toThrow()
  })

  test('a refused upgrade is a hook that throws the status; an allowed one has `open`', async () => {
    const at = (origin?: string, origins?: string[]) => {
      const r = new Request('http://app.test/_weft/ws', { headers: { upgrade: 'websocket', ...(origin && { origin }) } })
      return socketRoute(r, createScope(r), origins) as Promise<any>
    }
    const status = async (p: Promise<any>) => { try { (await p).crossws.upgrade() } catch (e: any) { return e.status } }
    expect(await status(at('http://evil.example'))).toBe(403)
    expect(await status(at())).toBe(403)
    expect(await status(at('http://app.test:81'))).toBe(403)
    expect(await status(at('https://app.test'))).toBe(403)
    expect(typeof (await at('http://app.test')).crossws.open).toBe('function')
    expect(typeof (await at('https://other.example', ['https://other.example'])).crossws.open).toBe('function')
  })

  test('R009: joins and sockets are limited', async () => {
    configure({ limits: { subscriptions: 1, connections: 1 } })
    const d = channel({ $id: 'hub.c', authorize: () => true })
    const frames: any[][] = []
    let closed = 0
    const peer = { send: (t: string) => void frames.push(JSON.parse(t)), close: (c: number) => void (closed = c), backlog: () => 0 }
    const r = new Request('http://app.test/_weft/ws')
    const a = await attach(peer, r, createScope(r, { context: () => ({ user: { id: 'u' } }) }))
    await attach(peer, r, createScope(r, { context: () => ({ user: { id: 'u' } }) }))
    expect(closed).toBe(1008)
    a.message(JSON.stringify(['j', 1, d.$id]))
    a.message(JSON.stringify(['j', 2, d.$id]))
    await wait()
    await wait()
    expect(frames.filter(f => f[0] === 'e').map(f => f[2].code)).toEqual(['R009'])
    await resetHub()
  })

  test('a socket over its send queue closes with 1013 and can resume', async () => {
    configure({ limits: { queue: 10 } })
    const d = channel({ $id: 'hub.q', authorize: () => true, server: { m: bare } })
    let closed = 0
    const peer = { send() {}, close: (c: number) => void (closed = c), backlog: () => 100 }
    const r = new Request('http://app.test/_weft/ws')
    await attach(peer, r, createScope(r))
    expect(closed).toBe(1013)
    expect(d.kind).toBe('channel')
    await resetHub()
  })
})
