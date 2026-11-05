// The hub and `/_weft/rt` without a server: rings and cursors, backpressure, limits, the Origin check and the bus
// contract. What a sink does, a real connection does; test/rt.test.ts runs the same protocol over HTTP.
import { sleep as wait } from '../../../scripts/lib/sleep.mjs'
import {
  channel,
  memoryBus,
  mutation,
  query,
  realtime,
  StartError,
  stream,
  type Bus,
} from '@weft-js/start'
import { configure, hub, resetHub, rtRoute, type Body } from '@weft-js/start/hub'
import { postgresBus } from '@weft-js/start/bus/postgres'
import { attach, socketRoute } from '../src/socket'
import { createScope, fetchQuery, liveQueries, runMutation } from '../src/exec'
import { currentScope, fns, runtime } from '@weft-js/start/data'
import { createHubFixture } from './hub.fixture'
import { registerHubStreamTests, registerPokeTests } from './hub.delivery'

/** What `socketRoute` answers an upgrade with: crossws reads the hooks off the response. */
type Upgrade = Response & { crossws: { upgrade(): unknown; open?: unknown } }

const { json, request, sink, open, of, bare, t } = createHubFixture()

registerPokeTests({ json, request, sink, open, of, bare, t })
registerHubStreamTests({ json, request, sink, open, of, bare, t })

describe('limits', () => {
  test('R008: a message over the limit', async () => {
    configure({ limits: { message: 4 } })
    await expect(t.publish('k', 'too long')).rejects.toThrow(/R008/)
  })

  test('R009: too many subscriptions, and too many connections for a user', async () => {
    configure({ limits: { subscriptions: 1, connections: 1 } })
    const { s } = await open(
      {
        s: [
          [1, 'q', 'hub.q'],
          [2, 'q', 'hub.q'],
        ],
      },
      sink(),
      { user: { id: 'u' } },
    )
    expect(of(s, 'e')[0]![1].code).toBe('R009')
    await expect(open({}, sink(), { user: { id: 'u' } })).rejects.toThrow(/R009/)
  })

  test('the session re-check ends an `auth` subscription when the user is gone', async () => {
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
    configure({ limits: { heartbeat: 10, session: 10 } })
    stream({
      $id: 'hub.mine',
      auth: 'user',
      async *run({ signal }) {
        while (!signal.aborted) await wait()
        yield 0
      },
    })
    let ctx: object = { user: { id: 'u' } }
    const body: Body = { s: [[1, 's', 'hub.mine']] }
    const r = request(body)
    const s = sink()
    await hub().connect(r, createScope(r, { context: () => ctx, dev: true }), body, s)
    await wait()
    ctx = { user: null }
    vi.advanceTimersByTime(10)
    vi.useRealTimers()
    await wait()
    expect(of(s, 'e')[0]![1].code).toBe('A002')
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
  const down = (): Bus => ({
    name: 'down',
    publish: () => Promise.reject(new Error('bus down')),
    subscribe: () => Promise.reject(new Error('bus down')),
  })

  test('making the hub reaches no bus: `weft build` loads this with nothing to connect to', () => {
    let subscribed = 0
    configure({ bus: { ...down(), subscribe: () => (subscribed++, Promise.resolve(() => {})) } })
    expect(subscribed).toBe(0)
  })

  test('opening a connection fails, and the next try starts over', async () => {
    let ok = false
    const bus = memoryBus()
    configure({
      bus: {
        ...bus,
        subscribe: (c, on) => (ok ? bus.subscribe(c, on) : Promise.reject(new Error('bus down'))),
      },
    })
    await expect(open({})).rejects.toThrow('bus down')
    expect(hub().stats().connections).toBe(0)
    ok = true
    const { s } = await open({})
    expect(of(s, 'h')).toHaveLength(1)
  })

  test("a mutation still succeeds when its poke can't go out", async () => {
    configure({ bus: down() })
    runtime.poke = (tags, origin) => hub().poke(tags, origin)
    const seen: string[] = []
    const m = mutation({ $id: 'hub.m', invalidates: ['x'], run: () => 'done' })
    const a = await runMutation(
      createScope(request({}), { onDiagnostic: (d) => seen.push(d.code) }),
      fns.get(m.$id)!,
      undefined,
      [],
    )
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

  test("R010: another origin is refused, unless it's listed", async () => {
    expect((await answer({}, { ...json, origin: 'http://evil.test' })).status).toBe(403)
    const ok = await answer(
      {},
      { ...json, origin: 'http://ok.test', 'sec-fetch-site': 'cross-site' },
      ['http://ok.test'],
    )
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
    for (; !/"4{40000}"/.test(text);) text += new TextDecoder().decode((await reader.read()).value)
    expect(text.match(/event: m/g)).toHaveLength(3) // 1 and 2 were written; 3 was replaced while held
    await reader.cancel()
  })

  test('Q002: a body of the wrong shape', async () => {
    for (const body of [null, [], { s: 'x' }, { s: [[1]] }, { d: ['a'] }])
      expect((await answer(body)).status).toBe(400)
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
  const reader = query({
    $id: 'hub.reader',
    tags: ['rows'],
    run: () => {
      currentScope()!.touched!.read.add('rows')
      return 1
    },
  })
  const write = mutation({
    $id: 'hub.write',
    invalidates: ['other'],
    run: () => {
      currentScope()!.touched!.write.add('rows')
    },
  })
  const scope = createScope(request({}), { dev: true, onDiagnostic: (d) => seen.push(d.code) })
  liveQueries.set(reader.$id, ['rows'])
  await fetchQuery(scope, fns.get(reader.$id)!, undefined)
  await runMutation(scope, fns.get(write.$id)!, undefined, [])
  expect(seen).toContain('R003')
})

// Needs a Postgres server, named by WEFT_TEST_POSTGRES.
describe.skipIf(!process.env.WEFT_TEST_POSTGRES)('postgres bus', () => {
  const url = process.env.WEFT_TEST_POSTGRES!

  test("two instances: a message crosses, in order, and a long one survives NOTIFY's limit", async () => {
    const a = postgresBus({ url }),
      b = postgresBus({ url })
    const got: string[] = []
    const stop = await b.subscribe('c', (m) => got.push(m))
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
    const r = new Request('http://app.test/_weft/ws', {
      headers: { upgrade: 'websocket', origin: 'http://app.test' },
    })
    const seen: string[] = []
    const res = (await socketRoute(r, createScope(r, { onDiagnostic: (d) => seen.push(d.code) }), [
      '*',
    ])) as Upgrade
    expect(seen).toEqual(['R004'])
    expect(() => res.crossws.upgrade()).toThrow()
  })

  test('a refused upgrade is a hook that throws the status; an allowed one has `open`', async () => {
    const at = (origin?: string, origins?: string[]) => {
      const r = new Request('http://app.test/_weft/ws', {
        headers: { upgrade: 'websocket', ...(origin && { origin }) },
      })
      return socketRoute(r, createScope(r), origins) as Promise<Upgrade>
    }
    const status = async (p: Promise<Upgrade>) => {
      try {
        ;(await p).crossws.upgrade()
        return undefined
      } catch (e) {
        return (e as { status: number }).status
      }
    }
    expect(await status(at('http://evil.example'))).toBe(403)
    expect(await status(at())).toBe(403)
    expect(await status(at('http://app.test:81'))).toBe(403)
    expect(await status(at('https://app.test'))).toBe(403)
    expect(typeof (await at('http://app.test')).crossws.open).toBe('function')
    expect(typeof (await at('https://other.example', ['https://other.example'])).crossws.open).toBe(
      'function',
    )
  })

  test('R009: joins and sockets are limited', async () => {
    configure({ limits: { subscriptions: 1, connections: 1 } })
    const d = channel({ $id: 'hub.c', authorize: () => true })
    const frames: [string, number, { code: string }][] = []
    let closed = 0
    const peer = {
      send: (text: string) => void frames.push(JSON.parse(text)),
      close: (c: number) => void (closed = c),
      backlog: () => 0,
    }
    const r = new Request('http://app.test/_weft/ws')
    const a = await attach(peer, r, createScope(r, { context: () => ({ user: { id: 'u' } }) }))
    await attach(peer, r, createScope(r, { context: () => ({ user: { id: 'u' } }) }))
    expect(closed).toBe(1008)
    a.message(JSON.stringify(['j', 1, d.$id]))
    a.message(JSON.stringify(['j', 2, d.$id]))
    await wait()
    await wait()
    expect(frames.filter((f) => f[0] === 'e').map((f) => f[2].code)).toEqual(['R009'])
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

test("a plugin's bus waits for its first use, and only then loads", async () => {
  const { slotBus, memoryBus: made } = await import('@weft-js/start/bus')
  let loads = 0
  const bus = slotBus('@weft-js/realtime-redis', () => (loads++, Promise.resolve(made())))
  expect(bus.name).toBe('redis')
  await bus.close?.()
  expect(loads).toBe(0)
  const got: string[] = []
  await bus.subscribe('c', (m) => got.push(m))
  await bus.publish('c', 'x')
  await new Promise((ok) => {
    setTimeout(ok)
  })
  expect(got).toEqual(['x'])
  expect(loads).toBe(1)
})
