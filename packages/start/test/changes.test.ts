// The change feed without a database: tags, coalescing, the barrier, status and modes. A fake source plays the database;
// test/changes-postgres.test.ts and changes-sqlite.test.ts run the same promises against real ones.
import type { Loose } from './loose'
import { memoryBus, query, type Sink, type Source } from '@weft-js/start'
import { configure, hub, liveHealth, resetHub, type Sink as ConnSink } from '@weft-js/start/hub'
import { createFeed, dbChanges, functionHost } from '@weft-js/start/changes'
import { listen } from '@weft-js/start/listen'
import { createScope, fetchQuery, invalidate, liveQueries, memoryStore } from '../src/exec'
import { onNetwork } from '../src/db/changes-sqlite'

const wait = (ms = 0) => new Promise(ok => { setTimeout(ok, ms) })

function fakeSource(over: Partial<Source> = {}) {
  let sink!: Sink
  const barriers: string[][] = []
  const source: Source & { sink: () => Sink; barriers: string[][]; stops: number; starts: number } = {
    name: 'fake', tables: ['todos', 'notes'],
    sink: () => sink, barriers, stops: 0, starts: 0,
    probe: () => Promise.resolve({ mode: 'feed', via: 'fake' }),
    start(s) {
      sink = s
      source.starts++
      return Promise.resolve(() => { source.stops++ })
    },
    settle(tags) {
      barriers.push(tags)
      sink?.settled(tags)
      return Promise.resolve()
    },
    ...over,
  }
  return source
}

function conn() {
  const frames: [string, Loose][] = []
  return { frames, closed: false, write(e: string, d: string) { frames.push([e, JSON.parse(d)]) }, backlog: () => 0, close() {} } as ConnSink & { frames: [string, Loose][] }
}
const request = () => new Request('http://app.test/_weft/rt', { method: 'POST' })
const open = async (subs: Loose[], s = conn(), ctx: object = {}) => {
  const r = request()
  const c = await hub().connect(r, createScope(r, { context: () => ctx, dev: true }), { s: subs }, s)
  return { c, s }
}
const of = (s: { frames: [string, Loose][] }, e: string) => s.frames.filter(f => f[0] === e).map(f => f[1])

const list = query({ $id: 'c.list', tags: ['todos'], run: () => [1] })
const one = query({ $id: 'c.one', tags: ({ id }: Loose) => [`todos:${id}`], run: () => 1 })
const both = query({ $id: 'c.both', tags: ({ id }: Loose) => ['todos', `todos:${id}`], run: () => 1 })
const other = query({ $id: 'c.other', tags: ['other'], run: () => 1 })
void list; void one; void both; void other

afterEach(async () => {
  await resetHub()
  liveQueries.clear()
})

describe('tags', () => {
  test('a change pokes the table and the row, and only subscribers of those', async () => {
    const source = fakeSource()
    configure({ changes: source })
    await hub().probed
    const a = await open([[1, 'q', 'c.list']])
    const b = await open([[1, 'q', 'c.one', { id: 5 }]])
    const c = await open([[1, 'q', 'c.one', { id: 6 }]])
    const d = await open([[1, 'q', 'c.other']])
    source.sink().changes([{ table: 'todos', id: '5' }])
    await wait(40)
    expect(of(a.s, 'p').map(p => p.t)).toEqual([['todos']])
    expect(of(b.s, 'p').map(p => p.t)).toEqual([['todos:5']])
    expect(of(c.s, 'p')).toEqual([])
    expect(of(d.s, 'p')).toEqual([])
  })

  test('a table-level change reaches row subscribers, by prefix', async () => {
    const source = fakeSource()
    configure({ changes: source })
    await hub().probed
    const b = await open([[1, 'q', 'c.one', { id: 5 }]])
    source.sink().changes([{ table: 'todos' }])
    await wait(40)
    expect(of(b.s, 'p').map(p => p.t)).toEqual([['todos:5']])
  })

  test('a table it doesn\'t list makes no poke, and a poke holds no row', async () => {
    const source = fakeSource()
    configure({ changes: source })
    await hub().probed
    const a = await open([[1, 'q', 'c.list']])
    source.sink().changes([{ table: 'users', id: '1' }])
    await wait(40)
    expect(of(a.s, 'p')).toEqual([])
    source.sink().changes([{ table: 'todos', id: '1' }])
    await wait(40)
    expect(Object.keys(of(a.s, 'p')[0]).sort()).toEqual(['c', 't'])
  })

  test('`tagged` maps a change to the tags an app uses', async () => {
    const seen: Loose[] = []
    const feed = createFeed({ ...fakeSource(), tables: ['notes'], tagged: c => [`note:${c.id}`], start: s => (s.changes([{ table: 'notes', id: '1' }]), Promise.resolve(() => {})) }, { emit: p => seen.push(p), status() {} }, { hold: 1 })
    await feed.start({ mode: 'feed', via: 'x' })
    await wait(10)
    expect(seen).toEqual([{ t: ['note:1'] }])
  })
})

describe('dedupe', () => {
  test('a mutation\'s barrier covers its own change: one poke, whichever way it arrives', async () => {
    const source = fakeSource()
    configure({ changes: source })
    await hub().probed
    const a = await open([[1, 'q', 'c.list']])
    source.sink().changes([{ table: 'todos', id: '1' }]) // the commit
    await hub().poke(['todos']) // the mutation, a moment later
    await wait(60)
    expect(source.barriers).toEqual([['todos']])
    expect(of(a.s, 'p')).toHaveLength(1)
  })

  test('the connection that made the write gets nothing from the feed either', async () => {
    const source = fakeSource()
    configure({ changes: source })
    await hub().probed
    const a = await open([[1, 'q', 'c.list']])
    source.sink().changes([{ table: 'todos', id: '1' }])
    await hub().poke(['todos'], a.c.k)
    await wait(60)
    expect(of(a.s, 'p')).toEqual([])
  })

  test('what the barrier doesn\'t cover still arrives: a query of the row, and another table', async () => {
    const source = fakeSource()
    configure({ changes: source })
    await hub().probed
    const row = await open([[1, 'q', 'c.one', { id: 1 }]])
    const whole = await open([[1, 'q', 'c.both', { id: 1 }]])
    source.sink().changes([{ table: 'todos', id: '1' }, { table: 'notes', id: '9' }])
    await hub().poke(['todos'])
    await wait(60)
    expect(of(row.s, 'p').map(p => p.t)).toEqual([['todos:1']]) // the mutation named no row tag
    expect(of(whole.s, 'p').map(p => p.t)).toEqual([['todos']]) // poked by the mutation: no second refetch
  })

  test('a change after the barrier is delivered: nothing is dropped on a clock', async () => {
    const source = fakeSource()
    configure({ changes: source })
    await hub().probed
    const a = await open([[1, 'q', 'c.list']])
    await hub().poke(['todos'])
    source.sink().changes([{ table: 'todos', id: '2' }])
    await wait(60)
    expect(of(a.s, 'p')).toHaveLength(2)
  })

  test('a change after the barrier isn\'t mistaken for one it covered, however close', async () => {
    const seen: Loose[] = []
    const source = fakeSource()
    const feed = createFeed(source, { emit: p => seen.push(p), status() {} }, { hold: 5 })
    await feed.start({ mode: 'feed', via: 'x' })
    source.sink().changes([{ table: 'todos', id: '1' }, { table: 'notes', id: '1' }])
    source.sink().settled(['todos'])
    source.sink().changes([{ table: 'todos', id: '2' }])
    await wait(20)
    expect(seen).toHaveLength(1)
    expect(seen[0].k ?? []).not.toContain('todos')
    expect(seen[0].t).toContain('todos')
  })

  test('a barrier that never returns costs the write nothing', async () => {
    const feed = createFeed(fakeSource({ settle: () => new Promise(() => {}) }), { emit() {}, status() {} }, { barrier: 5 })
    await feed.settle(['todos'])
  })

  test('a mutation of tables nothing watches sends no barrier', async () => {
    const source = fakeSource()
    configure({ changes: source })
    await hub().probed
    await hub().poke(['settings', 'other:1'])
    expect(source.barriers).toEqual([])
  })
})

describe('coalescing', () => {
  test('a burst is one poke, and a sustained writer is held to `throttle`', async () => {
    const seen: number[] = []
    const source = fakeSource()
    const feed = createFeed(source, { emit: () => seen.push(Date.now()), status() {} }, { hold: 5, throttle: 60 })
    await feed.start({ mode: 'feed', via: 'x' })
    const until = Date.now() + 200
    while (Date.now() < until) {
      source.sink().changes([{ table: 'todos', id: String(Math.random()) }])
      await wait(2)
    }
    await wait(80)
    expect(seen.length).toBeGreaterThanOrEqual(2)
    expect(seen.length).toBeLessThanOrEqual(5)
    for (let i = 1; i < seen.length; i++) expect(seen[i]! - seen[i - 1]!).toBeGreaterThanOrEqual(55)
  })

  test('the shared cache is bumped, so a refetch can\'t answer with what the change made stale', async () => {
    let runs = 0
    const cached = query({ $id: 'c.cached', tags: ['todos'], cache: { life: 'hours' }, run: () => ++runs })
    void cached
    const store = memoryStore()
    const source = fakeSource()
    configure({ changes: source, store })
    await hub().probed
    await open([[1, 'q', 'c.list']])
    const read = async () => (await fetchQuery(createScope(request(), { store }), (await import('@weft-js/start/data')).fns.get('c.cached')!, undefined)).v
    expect(await read()).toBe(1)
    expect(await read()).toBe(1)
    source.sink().changes([{ table: 'todos', id: '1' }])
    expect(await read()).toBe(2)
  })
})

describe('recovery and status', () => {
  test('a lost feed pokes every table once it\'s back, and says so meanwhile', async () => {
    const source = fakeSource()
    configure({ changes: source })
    await hub().probed
    const a = await open([[1, 'q', 'c.list']])
    expect(of(a.s, 'h')[0].l).toEqual({ m: 'feed' })
    source.sink().down('gone')
    expect(of(a.s, 'L')).toEqual([{ m: 'feed', d: 1 }])
    expect(liveHealth()).toMatchObject({ mode: 'feed', down: 'gone' })
    source.sink().lost()
    source.sink().up()
    await wait(40)
    expect(of(a.s, 'L').at(-1)).toEqual({ m: 'feed' })
    expect(of(a.s, 'p').map(p => p.t)).toEqual([['todos']])
  })

  test('a client that connects while the feed is down hears it at once', async () => {
    const source = fakeSource()
    configure({ changes: source })
    await hub().probed
    const a = await open([[1, 'q', 'c.list']])
    source.sink().down('gone')
    const b = await open([[1, 'q', 'c.list']])
    expect(of(b.s, 'h')[0].l).toEqual({ m: 'feed', d: 1 })
    void a
  })

  test('a resume replays what the feed poked while the client was away', async () => {
    const source = fakeSource()
    configure({ changes: source })
    await hub().probed
    const a = await open([[1, 'q', 'c.list']])
    const from = of(a.s, 'h')[0].c
    hub().close(a.c)
    source.sink().changes([{ table: 'todos', id: '1' }])
    await wait(40)
    const r = request()
    const back = conn()
    await hub().connect(r, createScope(r, { dev: true }), { c: from, s: [[1, 'q', 'c.list']] }, back)
    expect(of(back, 'p').map(p => p.t)).toEqual([['todos']])
  })

  test('no connections, no listener: it starts on the first client and stops after the window', async () => {
    const source = fakeSource()
    configure({ changes: source, limits: { window: 20 } })
    await hub().probed
    expect(source.starts).toBe(0)
    const a = await open([[1, 'q', 'c.list']])
    expect(source.starts).toBe(1)
    hub().close(a.c)
    await wait(60)
    expect(source.stops).toBe(1)
    await open([[1, 'q', 'c.list']])
    expect(source.starts).toBe(2)
  })
})

describe('modes', () => {
  const quiet = () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
  }
  afterEach(() => void vi.restoreAllMocks())

  test('no `changes`: mode `app`, as ever, and no `l` for an old client to trip on', async () => {
    const a = await open([[1, 'q', 'c.list']])
    expect(of(a.s, 'h')[0].l).toBeUndefined()
    expect(hub().live().mode).toBe('app')
    expect(liveHealth().ok).toBe(true)
  })

  test('a degraded mode is logged once, and shown', async () => {
    quiet()
    const seen: Loose[] = []
    configure({ changes: fakeSource({ probe: () => Promise.resolve({ mode: 'poll', via: 'stats', why: 'no trigger', fix: 'run it' }) }), onDiagnostic: d => seen.push(d) })
    await hub().probed
    const a = await open([[1, 'q', 'c.list']])
    expect(of(a.s, 'h')[0].l).toEqual({ m: 'poll' })
    expect(seen.map(d => d.code)).toEqual(['R016'])
    expect(console.warn).toHaveBeenCalledOnce()
    expect(vi.mocked(console.warn).mock.calls[0]![0]).toMatch(/poll \(stats\): no trigger\n {2}fix: run it/)
  })

  test('required, with no real feed: R015, and requests are refused rather than served stale', async () => {
    quiet()
    configure({ dev: true, required: ['listTodos'], changes: fakeSource({ probe: () => Promise.resolve({ mode: 'poll', via: 'stats', why: 'a pooler', fix: 'listenUrl' }) }) })
    await hub().probed
    expect(hub().refused?.code).toBe('R015')
    expect(hub().refused?.message).toMatch(/`listTodos` requires a live feed.*a pooler\n {2}fix: listenUrl/s)
    expect(liveHealth()).toMatchObject({ ok: false, required: true, mode: 'poll' })
  })

  test('required, with a feed: nothing to say, and health reports an outage without stopping the server', async () => {
    quiet()
    const source = fakeSource()
    configure({ dev: true, required: ['listTodos'], changes: source })
    await hub().probed
    expect(hub().refused).toBeUndefined()
    await open([[1, 'q', 'c.list']])
    expect(liveHealth().ok).toBe(true)
    source.sink().down('gone')
    expect(liveHealth().ok).toBe(false)
    expect(hub().refused).toBeUndefined()
  })

  test('required on a functions host at run time is refused too', async () => {
    quiet()
    vi.stubEnv('VERCEL', '1')
    const probe = vi.fn()
    configure({ dev: true, required: ['q'], changes: fakeSource({ probe }) })
    await hub().probed
    vi.unstubAllEnvs()
    expect(probe).not.toHaveBeenCalled()
    expect(hub().live()).toMatchObject({ mode: 'off' })
    expect(hub().refused?.message).toMatch(/Vercel ends a process/)
  })

  test('an external listener satisfies required; its silence is what `.live` shows', async () => {
    quiet()
    const bus = memoryBus()
    const source = fakeSource({ external: true })
    configure({ dev: true, bus, required: ['q'], changes: source, limits: { window: 40, heartbeat: 10 } })
    await hub().probed
    expect(hub().refused).toBeUndefined()
    expect(hub().live().mode).toBe('external')
    expect(source.starts).toBe(0)
    const a = await open([[1, 'q', 'c.list']])
    expect(of(a.s, 'h')[0].l).toEqual({ m: 'external' })
    await wait(70)
    expect(of(a.s, 'L').at(-1)).toEqual({ m: 'external', d: 1 })
    await bus.publish('weft:poke', '{"v":1,"b":1}')
    await wait(1)
    expect(of(a.s, 'L').at(-1)).toEqual({ m: 'external' })
  })

  test('`listen` publishes to the bus, so a hub with no source of its own pokes its clients', async () => {
    quiet()
    const bus = memoryBus()
    configure({ bus, changes: fakeSource({ external: true }) })
    await hub().probed
    const a = await open([[1, 'q', 'c.list']])
    const remote = fakeSource()
    const stop = await listen({ changes: remote, bus: { publish: (c, m) => bus.publish(c, m), subscribe: (c, on, gap) => bus.subscribe(c, on, gap), name: 'shared' }, say() {}, beat: 1000 })
    remote.sink().changes([{ table: 'todos', id: '1' }])
    await wait(40)
    expect(of(a.s, 'p').map(p => p.t)).toEqual([['todos']])
    await stop()
  })

  test('`listen` refuses the memory bus and a source with no feed', async () => {
    quiet()
    await expect(listen({ changes: fakeSource(), bus: { name: 'memory' } as Loose, say() {} })).rejects.toThrow(/R017/)
    await expect(listen({ changes: fakeSource({ probe: () => Promise.resolve({ mode: 'off', via: 'none', why: 'x' }) }), bus: { name: 'redis' } as Loose, say() {} })).rejects.toThrow(/R015/)
  })
})

describe('detection helpers', () => {
  test('`functionHost` reads what a platform sets', () => {
    expect(functionHost({})).toBeUndefined()
    expect(functionHost({ VERCEL: '1' })).toBe('Vercel')
    expect(functionHost({ NETLIFY: 'true' })).toBe('Netlify')
    expect(functionHost({ AWS_LAMBDA_FUNCTION_NAME: 'f' })).toBe('AWS Lambda')
  })

  test('`onNetwork`: statfs on Linux, the device name elsewhere', () => {
    const statfs = (type: number) => (() => ({ type })) as Loose
    expect(onNetwork('/x', { platform: 'linux', statfs: statfs(0x6969) })).toBe(true)
    expect(onNetwork('/x', { platform: 'linux', statfs: statfs(0xef53) })).toBe(false)
    expect(onNetwork('/x', { platform: 'darwin', df: () => 'Filesystem\n//nas/share 1 2 3 4% /mnt\n' })).toBe(true)
    expect(onNetwork('/x', { platform: 'darwin', df: () => 'Filesystem\nhost:/export 1 2 3 4% /mnt\n' })).toBe(true)
    expect(onNetwork('/x', { platform: 'darwin', df: () => 'Filesystem\n/dev/disk3s5 1 2 3 4% /\n' })).toBe(false)
  })

  test('`dbChanges` refuses what it can\'t watch', () => {
    expect(() => dbChanges({}, [])).toThrow(/R017/)
  })
})

test('a poke of a tag no feed covers takes the old path', async () => {
  const a = await open([[1, 'q', 'c.list']])
  await invalidate(createScope(request()), [])
  await hub().poke(['todos'])
  await wait()
  expect(of(a.s, 'p')).toHaveLength(1)
})
