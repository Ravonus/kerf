// @vitest-environment jsdom
// `.live`, `stream` and reconnects over @kerf-js/core/test's fake transport (research 30 §7): the real hub, the real client, a
// memory bus, no sockets.
import { createRoot, state } from '@kerf-js/core'
import { clock, flush, net, page, render, screen } from '@kerf-js/core/test'
import { mutation, query, skip, stale, type StandardSchemaV1 } from '@kerf-js/start'
import { backoff } from '@kerf-js/start/live'
import { configure, hub } from '@kerf-js/start/hub'
import { seed } from '@kerf-js/start/data'
import { registerLiveStreamTests } from './live.stream'

type Todo = { id: string; title: string }
const any: StandardSchemaV1<unknown> = {
  '~standard': { version: 1, vendor: 't', validate: (v) => ({ value: v }) },
}
const typed = <T,>() => any as StandardSchemaV1<T>

let db: Todo[]
let runs: number
beforeEach(() => {
  db = [
    { id: '1', title: 'One' },
    { id: '2', title: 'Two' },
  ]
  runs = 0
})

const listTodos = query({
  $id: 'live.list',
  tags: ['todos'],
  run: () => (runs++, db.map((t) => ({ ...t }))),
})
const byList = query({
  $id: 'live.by',
  input: typed<{ id: string }>(),
  tags: ({ id }) => [`list:${id}`],
  run: ({ input }) => (runs++, `list ${input.id}`),
})
const untagged = query({ $id: 'live.none', run: () => 1 })
const rename = mutation({
  $id: 'live.rename',
  input: typed<{ id: string; title: string }>(),
  invalidates: ['todos'],
  run: ({ input }) => {
    db.find((t) => t.id === input.id)!.title = input.title
  },
})

function List() {
  const todos = listTodos.live()
  return (
    <>
      <p aria-label="status">{todos.live.value}</p>
      <ul>
        {(todos.value ?? []).map((t) => (
          <li key={t.id}>{t.title}</li>
        ))}
      </ul>
    </>
  )
}
const items = () => screen.getAllByRole('listitem').map((li) => li.textContent)
const status = () => screen.getByLabelText('status').textContent

function registerLiveInvalidationTests() {
  test("a poke while a refetch is in flight isn't swallowed by that older answer", async () => {
    render(List)
    await net.settle()
    let release!: () => void
    const held = new Promise<void>((ok) => {
      release = ok
    })
    let first = true
    net.handle(listTodos, async () => {
      const snapshot = db.map((t) => ({ ...t })) // read now, answered later: what a slow query does
      if (first) {
        first = false
        await held
      }
      return snapshot
    })
    void net.poke('todos') // the first write: a refetch starts, and reads
    await new Promise((ok) => {
      setTimeout(ok, 5)
    })
    expect(first).toBe(false)
    db[1]!.title = 'Second write'
    void net.poke('todos') // arrives while that refetch is out
    await new Promise((ok) => {
      setTimeout(ok, 5)
    })
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
}

function registerLiveSubscriptionTests() {
  test('readers share one subscription, keyed by function and input; args are tracked', async () => {
    const id = state('a')
    function Two() {
      const a = byList.live(() => ({ id: id.value }))
      const b = byList.live(() => ({ id: id.value }))
      return (
        <p>
          {a.value} {b.value}
        </p>
      )
    }
    render(Two)
    await net.settle()
    expect(screen.getByText('list a list a')).toBeTruthy()
    expect(net.subscriptions()).toEqual([{ kind: 'query', id: 'live.by', input: { id: 'a' } }])
    id.value = 'b'
    await net.settle()
    expect(screen.getByText('list b list b')).toBeTruthy()
    expect(net.subscriptions().map((s) => s.input)).toContainEqual({ id: 'b' })
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
}

function registerLiveDiagnosticTests() {
  test('W053: a live query with no tags warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    render(() => <p>{untagged.live().value}</p>)
    await net.settle()
    expect(warn.mock.calls.flat().join('\n')).toContain('W053')
    warn.mockRestore()
  })

  test('a live query that leaks past its test is T012', async () => {
    const stop = createRoot((dispose) => {
      listTodos.live()
      return dispose
    })
    await net.settle()
    const { leaks } = await import('@kerf-js/core/test')
    expect(leaks().join()).toContain('live.list')
    stop()
    expect(leaks()).toEqual([])
  })
}

describe('.live', () => {
  registerLiveInvalidationTests()
  registerLiveSubscriptionTests()
  registerLiveDiagnosticTests()
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

registerLiveStreamTests(any, typed)

describe("the page's cursor (#kerf-rt)", () => {
  const carry = (payload: object) => {
    const el = document.createElement('script')
    el.id = 'kerf-rt'
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
