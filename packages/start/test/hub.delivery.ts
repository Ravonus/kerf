import { sleep as wait } from '../../../scripts/lib/sleep.mjs'
import { memoryBus, query, stream, tracked } from '@kerf-js/start'
import { configure, hub, type Body, type SubEntry } from '@kerf-js/start/hub'
import { createScope } from '../src/exec'
import { currentScope } from '@kerf-js/start/data'
import type { createHubFixture } from './hub.fixture'

type HubFixture = ReturnType<typeof createHubFixture>

function registerPokeDeliveryTests(fixture: HubFixture) {
  const { open, of } = fixture
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
    const from = of(s, 'h')[0]!.c
    await hub().poke(['a'])
    await hub().poke(['b'])
    await wait()
    const back = await open({ c: from, s: [[1, 'q', 'hub.q']] })
    expect(of(back.s, 'p').map((p) => p.t)).toEqual([['a'], ['b']])
    expect(of(back.s, 'R')).toEqual([])
    const other = await open({ c: 'elsewhere:3', s: [[1, 'q', 'hub.q']] })
    expect(of(other.s, 'R')).toHaveLength(1)
  })

  test('a cursor older than the ring is a reset', async () => {
    configure({ limits: { ring: 2 } })
    const { s } = await open({ s: [[1, 'q', 'hub.q']] })
    const from = of(s, 'h')[0]!.c
    for (const x of ['a', 'b', 'a']) await hub().poke([x])
    await wait()
    expect(of((await open({ c: from, s: [[1, 'q', 'hub.q']] })).s, 'R')).toHaveLength(1)
  })

  test('a gap on the bus resets every connection and moves the floor', async () => {
    let gap!: () => void
    const bus = memoryBus()
    configure({
      bus: {
        ...bus,
        subscribe: (ch, on, g) => (ch === 'kerf:poke' && (gap = g!), bus.subscribe(ch, on)),
      },
    })
    const { s } = await open({ s: [[1, 'q', 'hub.q']] })
    gap()
    expect(of(s, 'R')).toHaveLength(1)
  })
}

function registerPokeBackpressureTests(fixture: HubFixture) {
  const { open, of, sink, request } = fixture
  test('held pokes merge by tag', async () => {
    let backlog = 0
    const { c, s } = await open(
      { s: [[1, 'q', 'hub.q']] },
      sink(() => backlog),
    )
    backlog = 1 << 20
    await hub().poke(['a'])
    await hub().poke(['b'])
    await hub().poke(['a'])
    await wait()
    expect(of(s, 'p')).toEqual([])
    backlog = 0
    hub().drain(c)
    expect(of(s, 'p').map((p) => p.t)).toEqual([['a', 'b']])
  })

  test('W053: the hub reports a live query with no tags', async () => {
    query({ $id: 'hub.none', run: () => 1 })
    const seen: string[] = []
    const r = request({})
    await hub().connect(
      r,
      createScope(r, { dev: true, onDiagnostic: (d) => seen.push(d.code) }),
      { s: [[1, 'q', 'hub.none']] },
      sink(),
    )
    expect(seen).toEqual(['W053'])
  })
}

export function registerPokeTests(fixture: HubFixture) {
  describe('pokes', () => {
    registerPokeDeliveryTests(fixture)
    registerPokeBackpressureTests(fixture)
  })
}

function registerStreamDeliveryTests(
  fixture: HubFixture,
  messages: (s: { frames: [string, unknown][] }) => unknown[],
) {
  const { open, of, sink, request, t } = fixture

  test('a topic message reaches a stream with a resumable cursor', async () => {
    const { s } = await open({ s: [[1, 's', 'hub.feed', undefined]] })
    await wait()
    await t.publish('k', 'one')
    await wait()
    expect(of(s, 'm')).toEqual([[1, expect.stringMatching(/:\d+$/), 'one']])
  })

  test("adding a subscription doesn't restart another's run", async () => {
    let runs = 0
    stream({
      $id: 'hub.count',
      async *run({ signal }) {
        runs++
        while (!signal.aborted) await wait()
        yield 0
      },
    })
    const { c } = await open({ s: [[1, 's', 'hub.count']] })
    await wait()
    await hub().change(c, request({}), { dev: true }, { s: [[2, 'q', 'hub.q']] })
    await wait()
    expect(runs).toBe(1)
  })

  test('a resume in the window replays, out of it the run restarts without a cursor', async () => {
    const seen: (string | undefined)[] = []
    stream({
      $id: 'hub.resume',
      async *run({ signal, lastEventId }) {
        seen.push(lastEventId)
        yield* t.subscribe('r', { signal, after: lastEventId })
      },
    })
    const a = await open({ s: [[1, 's', 'hub.resume']] })
    await wait()
    await t.publish('r', 1)
    await wait()
    const cursor = of(a.s, 'm')[0]![1]
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
    const { c, s } = await open(
      { s: [[1, 's', 'hub.feed']] },
      sink(() => backlog),
    )
    await wait()
    backlog = 1 << 20
    for (const x of [1, 2, 3]) await t.publish('k', x)
    await wait()
    expect(messages(s)).toEqual([])
    backlog = 0
    hub().drain(c)
    expect(messages(s)).toEqual([3])
  })
}

function registerStreamBackpressureTests(
  fixture: HubFixture,
  messages: (s: { frames: [string, unknown][] }) => unknown[],
) {
  const { open, of, sink, request, t } = fixture

  test('with `buffer`, messages are kept; an overflow resets the stream', async () => {
    let backlog = 0
    const entry: SubEntry = [1, 's', 'hub.feed']
    entry[5] = 2
    const { c, s } = await open(
      { s: [entry] },
      sink(() => backlog),
    )
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
    const { s } = await open(
      { s: [[1, 's', 'hub.feed']] },
      sink(() => backlog),
    )
    await wait()
    backlog = 1 << 20
    await t.publish('k', 'a message over eight bytes')
    await wait()
    expect(of(s, 'b')).toEqual([{ retry: 0 }])
    expect(s.closed).toBe(true)
  })
  test('tracked ids go through a plain handler too', async () => {
    // oxlint-disable typescript/require-await -- `run` is an async generator whatever its body does
    stream(
      {
        $id: 'hub.rows',
        async *run() {
          yield tracked('row-9', 'x')
        },
      } /* oxlint-enable typescript/require-await */,
    )
    const { s } = await open({ s: [[1, 's', 'hub.rows']] })
    await wait()
    expect(of(s, 'm')).toEqual([[1, 'row-9', 'x']])
    expect(of(s, 'f')).toEqual([[1]])
  })
  test('R006: a run that reads the database before it subscribes', async () => {
    stream({
      $id: 'hub.late',
      async *run({ signal }) {
        currentScope()!.touched!.read.add('msgs') // what the driver records for a select
        yield* t.subscribe('late', { signal })
      },
    })
    const seen: string[] = []
    const body: Body = { s: [[1, 's', 'hub.late']] }
    const r = request(body)
    await hub().connect(
      r,
      createScope(r, { dev: true, onDiagnostic: (d) => seen.push(d.code) }),
      body,
      sink(),
    )
    await wait()
    expect(seen).toEqual(['R006'])
  })
}

export function registerHubStreamTests(fixture: HubFixture) {
  const { of } = fixture
  describe('streams', () => {
    const messages = (s: { frames: [string, unknown][] }) => of(s, 'm').map((m) => m[2])

    registerStreamDeliveryTests(fixture, messages)
    registerStreamBackpressureTests(fixture, messages)
  })
}
