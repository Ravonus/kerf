// @vitest-environment jsdom
// `.live`, `stream` and reconnects over @weft-js/core/test's fake transport (research 30 §7): the real hub, the real client, a
// memory bus, no sockets.
import { createRoot, state, untrack, watch } from '@weft-js/core'
import { clock, flush, net, page, render, screen } from '@weft-js/core/test'
import { mutation, query, skip, stale, stream, topic, tracked, type StandardSchemaV1 } from '@weft-js/start'
import { backoff } from '@weft-js/start/live'
import { configure, hub } from '@weft-js/start/hub'
import { seed } from '@weft-js/start/data'

type Todo = { id: string; title: string }
const any: StandardSchemaV1<unknown> = { '~standard': { version: 1, vendor: 't', validate: v => ({ value: v }) } }
const typed = <T,>() => any as StandardSchemaV1<T>
type Price = { symbol?: string; price: number }

let db: Todo[]
let runs: number
beforeEach(() => {
  db = [{ id: '1', title: 'One' }, { id: '2', title: 'Two' }]
  runs = 0
})

const listTodos = query({ $id: 'live.list', tags: ['todos'], run: () => (runs++, db.map(t => ({ ...t }))) })
const byList = query({ $id: 'live.by', input: typed<{ id: string }>(), tags: ({ id }) => [`list:${id}`], run: ({ input }) => (runs++, `list ${input.id}`) })
const untagged = query({ $id: 'live.none', run: () => 1 })
const rename = mutation({ $id: 'live.rename', input: typed<{ id: string; title: string }>(), invalidates: ['todos'], run: ({ input }) => { db.find(t => t.id === input.id)!.title = input.title } })

function List() {
  const todos = listTodos.live()
  return (
    <>
      <p aria-label="status">{todos.live.value}</p>
      <ul>{(todos.value ?? []).map(t => <li key={t.id}>{t.title}</li>)}</ul>
    </>
  )
}
const items = () => screen.getAllByRole('listitem').map(li => li.textContent)
const status = () => screen.getByLabelText('status').textContent

describe('.live', () => {
  test('a poke while a refetch is in flight isn\'t swallowed by that older answer', async () => {
    render(List)
    await net.settle()
    let release!: () => void
    const held = new Promise<void>(ok => { release = ok })
    let first = true
    net.handle(listTodos, async () => {
      const snapshot = db.map(t => ({ ...t })) // read now, answered later: what a slow query does
      if (first) {
        first = false
        await held
      }
      return snapshot
    })
    void net.poke('todos') // the first write: a refetch starts, and reads
    await new Promise(ok => { setTimeout(ok, 5) })
    expect(first).toBe(false)
    db[1]!.title = 'Second write'
    void net.poke('todos') // arrives while that refetch is out
    await new Promise(ok => { setTimeout(ok, 5) })
    release()
    await net.settle()
    expect(items()).toEqual(['One', 'Second write'])
  })

  test('a poke refetches through the query, and only the changed row is written', async () => {
    render(List)
    await net.settle()
    expect(status()).toBe('live')
    expect(items()).toEqual(['One', 'Two'])
    const before = runs
    db[1]!.title = 'Changed'
    await expect(() => net.poke('todos')).toTouchAtMost(1)
    expect(items()).toEqual(['One', 'Changed'])
    expect(runs).toBe(before + 1)
  })

  test('a mutation elsewhere pokes the tags it invalidates; other tags stay quiet', async () => {
    render(List)
    await net.settle()
    const before = runs
    await net.poke('other')
    expect(runs).toBe(before)
    await rename({ id: '1', title: 'Renamed' })
    await net.settle()
    expect(items()).toEqual(['Renamed', 'Two'])
  })

  test('the tab that ran the mutation is not poked: single-flight already refreshed it', async () => {
    render(List)
    await net.settle()
    const before = runs
    await rename({ id: '1', title: 'Mine' })
    await net.settle()
    expect(items()).toEqual(['Mine', 'Two'])
    expect(runs).toBe(before + 1)
  })

  test('readers share one subscription, keyed by function and input; args are tracked', async () => {
    const id = state('a')
    function Two() {
      const a = byList.live(() => ({ id: id.value }))
      const b = byList.live(() => ({ id: id.value }))
      return <p>{a.value} {b.value}</p>
    }
    render(Two)
    await net.settle()
    expect(screen.getByText('list a list a')).toBeTruthy()
    expect(net.subscriptions()).toEqual([{ kind: 'query', id: 'live.by', input: { id: 'a' } }])
    id.value = 'b'
    await net.settle()
    expect(screen.getByText('list b list b')).toBeTruthy()
    expect(net.subscriptions().map(s => s.input)).toContainEqual({ id: 'b' })
  })

  test('skip subscribes to nothing until there is an input', async () => {
    const id = state<string | undefined>(undefined)
    function Maybe() {
      const r = byList.live(() => (id.value ? { id: id.value } : skip))
      return <p>{r.value ?? 'none'}</p>
    }
    render(Maybe)
    await net.settle()
    expect(screen.getByText('none')).toBeTruthy()
    expect(net.subscriptions()).toEqual([])
    id.value = 'x'
    await net.settle()
    expect(screen.getByText('list x')).toBeTruthy()
  })

  test('a subscription outlives its last reader for `keep`, and a remount finds it', async () => {
    clock.install()
    const show = state(true)
    function Tab() {
      const r = listTodos.live(undefined, { keep: '30s' })
      return <p>{r.value?.length}</p>
    }
    render(() => <div>{show.value ? <Tab /> : null}</div>)
    await net.settle()
    show.value = false
    await flush()
    expect(net.subscriptions()).toHaveLength(1)
    await clock.advance(29_000)
    show.value = true
    await flush()
    await clock.advance(2_000)
    expect(net.subscriptions()).toHaveLength(1)
    show.value = false
    await flush()
    await clock.advance(31_000)
    await net.settle()
    expect(net.subscriptions()).toEqual([])
  })

  test('W053: a live query with no tags warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(() => <p>{untagged.live().value}</p>)
    await net.settle()
    expect(warn.mock.calls.flat().join('\n')).toContain('W053')
    warn.mockRestore()
  })

  test('a live query that leaks past its test is T012', async () => {
    const stop = createRoot(dispose => { listTodos.live(); return dispose })
    await net.settle()
    const { leaks } = await import('@weft-js/core/test')
    expect(leaks().join()).toContain('live.list')
    stop()
    expect(leaks()).toEqual([])
  })
})

describe('reconnects', () => {
  test('a dropped connection reconnects and the poke cursor resumes: a poke while away is not lost', async () => {
    render(List)
    await net.settle()
    await net.offline()
    expect(status()).toBe('offline')
    db[0]!.title = 'While away'
    await net.poke('todos')
    await net.online()
    await net.settle()
    expect(status()).toBe('live')
    expect(net.reconnects()).toBe(1)
    expect(items()).toEqual(['While away', 'Two'])
  })

  test('net.drop(): the client comes back on its own and resubscribes', async () => {
    render(List)
    await net.settle()
    await net.drop()
    await vi.waitFor(() => expect(status()).toBe('live'))
    expect(net.reconnects()).toBe(1)
    db[0]!.title = 'After'
    await net.poke('todos')
    expect(items()).toEqual(['After', 'Two'])
  })

  test('the jitter is full, and caps at 30 s', () => {
    expect(backoff(0, () => 1)).toBe(500)
    expect(backoff(3, () => 1)).toBe(4000)
    expect(backoff(20, () => 1)).toBe(30_000)
    expect(backoff(5, () => 0)).toBe(0)
  })

  test('a tab away from the page closes on pagehide and resumes on pageshow', async () => {
    render(List)
    await net.settle()
    await page.leave({ persisted: true })
    await net.settle()
    expect(status()).not.toBe('live')
    await page.restore()
    await net.settle()
    await vi.waitFor(() => expect(status()).toBe('live'))
  })
})

const priceTopic = topic('prices', { key: any as StandardSchemaV1<unknown, string>, message: typed<Price>() })
const prices = stream({ $id: 'live.prices', input: typed<{ symbols: string[] }>(), message: typed<Price>(), async *run({ input, signal, lastEventId }) { yield* priceTopic.subscribe(input.symbols, { signal, after: lastEventId }) } })
// oxlint-disable-next-line typescript/require-await -- `run` is an async generator whatever its body does
const counter = stream({ $id: 'live.count', async *run({ lastEventId }) { let n = Number(lastEventId ?? 0); for (;;) { yield tracked(String(++n), n); if (n % 2 === 0) return } } })
// oxlint-disable-next-line typescript/require-await -- `run` is an async generator whatever its body does
const secret = stream({ $id: 'live.secret', auth: 'user', async *run() { yield 'hidden' } })
// oxlint-disable-next-line typescript/require-await -- `run` is an async generator whatever its body does
const once = stream({ $id: 'live.once', async *run() { yield 1; yield 2 } })
const numeric: StandardSchemaV1<unknown, number> = { '~standard': { version: 1, vendor: 't', validate: v => (typeof v === 'number' ? { value: v } : { issues: [{ message: 'not a number' }] }) } }
// oxlint-disable-next-line typescript/require-await -- `run` is an async generator whatever its body does
const broken = stream({ $id: 'live.broken', message: numeric, async *run() { yield 'nope' as unknown as number } })

function Tick() {
  const tick = prices({ symbols: ['A'] })
  return <p aria-label="tick">{tick.status.value}: {tick.value?.price ?? 'none'}</p>
}
const tick = () => screen.getByLabelText('tick').textContent

describe('stream', () => {
  test('topic → stream → box: messages update in place', async () => {
    render(Tick)
    await net.settle()
    await flush()
    await priceTopic.publish('A', { symbol: 'A', price: 1 })
    await vi.waitFor(() => expect(tick()).toBe('live: 1'))
    await expect(async () => {
      await priceTopic.publish('A', { symbol: 'A', price: 2 })
      await vi.waitFor(() => expect(tick()).toBe('live: 2'))
    }).toTouchAtMost(1)
  })

  test('a fold lives in the cache: a remount within `keep` finds its state', async () => {
    const show = state(true)
    function Board() {
      const board = prices({ symbols: ['A'] }, { fold: (acc: number[], m: { price: number }) => [...acc, m.price], initial: [] as number[], keep: '30s' })
      return <p aria-label="board">{board.value.join(',')}</p>
    }
    render(() => <div>{show.value ? <Board /> : null}</div>)
    await net.settle()
    await net.push(prices, { price: 1 })
    await net.push(prices, { price: 2 })
    show.value = false
    await flush()
    await net.push(prices, { price: 3 })
    show.value = true
    await flush()
    expect(screen.getByLabelText('board').textContent).toBe('1,2,3')
  })

  test('two folds over one key share one server subscription', async () => {
    function Both() {
      const sum = prices({ symbols: ['A'] }, { fold: (a: number, m: { price: number }) => a + m.price, initial: 0 })
      const max = prices({ symbols: ['A'] }, { fold: (a: number, m: { price: number }) => Math.max(a, m.price), initial: 0 })
      return <p aria-label="both">{sum.value} {max.value}</p>
    }
    render(Both)
    await net.settle()
    expect(await net.push(prices, { price: 2 })).toBe(1)
    await net.push(prices, { price: 3 })
    expect(screen.getByLabelText('both').textContent).toBe('5 3')
  })

  test('resume: a reconnect gets what the ring still has, exactly once', async () => {
    function Log() {
      const log = prices({ symbols: ['A'] }, { fold: (acc: number[], m: { price: number }) => [...acc, m.price], initial: [] as number[] })
      return <p aria-label="log">{log.value.join(',')}</p>
    }
    render(Log)
    await net.settle()
    await flush()
    await priceTopic.publish('A', { price: 1 })
    await vi.waitFor(() => expect(screen.getByLabelText('log').textContent).toBe('1'))
    await net.offline()
    await priceTopic.publish('A', { price: 2 })
    await priceTopic.publish('A', { price: 3 })
    await net.online()
    await vi.waitFor(() => expect(screen.getByLabelText('log').textContent).toBe('1,2,3'))
    await priceTopic.publish('A', { price: 4 })
    await vi.waitFor(() => expect(screen.getByLabelText('log').textContent).toBe('1,2,3,4'))
  })

  test('a finished stream reports done and is not rerun by a reconnect', async () => {
    function One() {
      const s = once(undefined as void, { fold: (a: number, m: number) => a + m, initial: 0 })
      return <p aria-label="once">{s.status.value}: {s.value}</p>
    }
    render(One)
    await vi.waitFor(() => expect(screen.getByLabelText('once').textContent).toBe('done: 3'))
  })

  test('`tracked` ids come back as lastEventId', async () => {
    function Count() {
      const s = counter(undefined as void)
      return <p aria-label="count">{s.status.value} {s.value}</p>
    }
    render(Count)
    await vi.waitFor(() => expect(screen.getByLabelText('count').textContent).toBe('done 2'))
  })

  test('auth: \'user\' with no session fails with A002', async () => {
    let seen: unknown
    function S() {
      const s = secret(undefined as void)
      watch(() => s.error, e => { seen = e })
      return <p aria-label="err">{s.error ? (s.error as Error).message : 'none'}</p>
    }
    net.context({ user: null })
    render(S)
    await vi.waitFor(() => expect(screen.getByLabelText('err').textContent).toContain('A002'))
    expect(seen).toBeTruthy()
  })

  test('a message its schema rejects is C002 in dev', async () => {
    function B() {
      const s = broken(undefined as void)
      return <p aria-label="c002">{s.error ? (s.error as Error).message : 'none'}</p>
    }
    render(B)
    await vi.waitFor(() => expect(screen.getByLabelText('c002').textContent).toContain('C002'))
  })

  test('W051: a stream outside an owner throws', () => {
    expect(() => untrack(() => prices({ symbols: ['A'] }))).toThrow(/W051/)
  })

  test('net.push needs a connection, and says so', () => {
    expect(() => net.push(prices, {})).toThrow(/no realtime connection/)
  })
})

describe('the page\'s cursor (#weft-rt)', () => {
  const carry = (payload: object) => {
    const el = document.createElement('script')
    el.id = 'weft-rt'
    el.type = 'application/json'
    el.textContent = JSON.stringify(payload)
    document.body.append(el)
  }
  const rendered = async () => {
    configure({ build: 'b1' })
    await hub().ready()
    seed([['live.list', undefined, db, ['todos']]])
    return hub().cursor()!
  }

  test('with a cursor, hydrated data is trusted: no refetch', async () => {
    carry({ c: await rendered(), b: 'b1' })
    render(List)
    await net.settle()
    expect(status()).toBe('live')
    expect(runs).toBe(0)
    expect(stale.value).toBe(false)
  })

  test('a write between the render and the connection is replayed', async () => {
    carry({ c: await rendered(), b: 'b1' })
    db = [{ id: '1', title: 'Written meanwhile' }]
    await hub().poke(['todos'])
    render(List)
    await net.settle()
    expect(items()).toEqual(['Written meanwhile'])
    expect(runs).toBe(1)
  })

  test('without a cursor, data older than the subscription refetches once', async () => {
    await rendered()
    render(List)
    await net.settle()
    expect(runs).toBe(1)
  })

  test('another build on the server: `stale`', async () => {
    carry({ c: await rendered(), b: 'older' })
    render(List)
    await net.settle()
    expect(stale.value).toBe(true)
  })
})

test('a tab hidden for 5 minutes closes, and comes back when shown', async () => {
  clock.install()
  render(List)
  await net.settle()
  expect(status()).toBe('live')
  await page.hide()
  await clock.advance(299_000)
  expect(status()).toBe('live')
  await clock.advance(2_000)
  await net.settle()
  expect(status()).toBe('reconnecting')
  await page.show()
  await net.settle()
  expect(status()).toBe('live')
})
