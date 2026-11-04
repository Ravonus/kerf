// @vitest-environment jsdom
// Replies in any order (research 40 §5): a transport whose answers the test hands out by hand, so a reply can be as late as
// a real one. The fake's one fixed latency can't reorder anything. The final screen has to be the database's state, whichever
// order the network picked.
import { Boundary } from '@weft-js/core'
import { flush, render, screen } from '@weft-js/core/test'
import { cache, mutation, query, type StandardSchemaV1 } from '@weft-js/start'
import { FnError, runtime, seed, type Answer, type Wire } from '@weft-js/start/data'
import { client as router } from '../src/router'

type Row = { id: string; done: boolean }
const any: StandardSchemaV1<unknown> = { '~standard': { version: 1, vendor: 't', validate: v => ({ value: v }) } }
const typed = <T,>() => any as StandardSchemaV1<T>
const toggleInput = typed<{ id: string; done: boolean }>()
/** What a streamed page's scripts push its chunks onto. */
const landed = () => (globalThis as typeof globalThis & { $wc: { c: Wire[]; b?: object }[] }).$wc

const list = query({ $id: 'rows', tags: ['rows'], run: () => [] as Row[] })
const other = query({ $id: 'other', tags: ['other'], run: () => 0 })
const set = mutation({
  $id: 'set',
  input: toggleInput,
  invalidates: ['rows'],
  optimistic: ({ input }, c) => c.update(list, undefined, l => { l.find(r => r.id === input.id)!.done = input.done }),
  run: () => {},
})
const push = mutation({
  $id: 'push',
  invalidates: ['rows'],
  optimistic: (_, c) => c.update(list, undefined, l => void l.push({ id: 'new', done: false })),
  run: () => {},
})
const plain = mutation({ $id: 'plain', invalidates: ['rows'], run: () => {} })
const bad = mutation({ $id: 'bad', invalidates: ['rows'], optimistic: () => { throw new Error('bad prediction') }, run: () => {} })
const row = query({ $id: 'row', input: typed<{ i: number }>(), tags: ['rows'], run: (): unknown => 0 })

interface Call { kind: string; id: string; input: unknown; ok(a: Answer): void; no(e: unknown): void }
let calls: Call[]
beforeEach(() => {
  calls = []
  const call = (kind: string) => (id: string, input: unknown) => new Promise<Answer>((ok, no) => { calls.push({ kind, id, input, ok, no }) })
  runtime.transport = { query: call('query'), mutate: call('mutate') }
})
afterEach(() => { delete runtime.transport })

const rows = (done: boolean): Row[] => [{ id: 'a', done }]
const reply = (done: boolean): Answer => ({ t: ['rows'], c: [['rows', undefined, rows(done), ['rows']]] })
const read = (done: boolean): Answer => ({ v: rows(done), t: ['rows'] })
const reads = () => calls.filter(c => c.kind === 'query')

function List() {
  const l = list()
  return <ul>{(l.value ?? []).map(r => <li key={r.id}>{r.done ? 'done' : 'open'}</li>)}</ul>
}
const shown = () => screen.getAllByRole('listitem').map(li => li.textContent)
function Guarded() {
  return <Boundary pending={<p>loading</p>} error={() => <p>failed</p>}><List /></Boundary>
}
const lost = () => new TypeError('Failed to fetch')
/** A tab left this long ago comes back. */
function returns(...events: (() => void)[]) {
  const real = performance.now.bind(performance)
  const spy = vi.spyOn(performance, 'now').mockImplementation(() => real() + 60_000)
  for (const fire of events) fire()
  spy.mockRestore()
}
const focus = () => window.dispatchEvent(new Event('focus'))
const showing = () => document.dispatchEvent(new Event('visibilitychange'))
const tick = async () => { await new Promise(ok => { setTimeout(ok) }); await flush() }

async function ready(done = false) {
  seed([['rows', undefined, rows(done), ['rows']]])
  render(List)
  await flush()
}

test('one call, nothing overlapping: its reply lands and nothing is read again', async () => {
  await ready()
  const p = set({ id: 'a', done: true })
  calls[0]!.ok(reply(true))
  await p
  await tick()
  expect(shown()).toEqual(['done'])
  expect(reads()).toEqual([])
})

test('two overlapping calls answered in reverse: no reply lands, and one read after the last says what is true', async () => {
  await ready()
  const a = set({ id: 'a', done: true }), b = set({ id: 'a', done: false })
  await flush()
  expect(shown()).toEqual(['open'])
  const [first, second] = calls
  second!.ok(reply(false))
  await b
  await tick()
  expect(shown()).toEqual(['open'])
  expect(reads()).toEqual([])
  first!.ok(reply(true)) // the older value, last in: it must not show
  await a
  await tick()
  expect(shown()).toEqual(['open'])
  expect(reads().length).toBe(1)
  reads()[0]!.ok(read(false))
  await tick()
  expect(shown()).toEqual(['open'])
  expect(cache.get(list)).toEqual(rows(false))
})

test('five overlapping toggles, any order of replies: the screen follows the clicks and ends on the server', async () => {
  for (const order of [[4, 3, 2, 1, 0], [1, 0, 3, 2, 4], [2, 4, 0, 3, 1], [0, 1, 2, 3, 4]]) {
    calls.length = 0
    cache.clear()
    await ready()
    const want = [true, false, true, false, true]
    const done = want.map(d => set({ id: 'a', done: d }))
    await flush()
    const sent = calls.slice()
    for (const i of order) {
      sent[i]!.ok(reply(want[i]!))
      await done[i]
      await tick()
      expect(shown().at(-1)).toBe('done') // the last click, whatever has answered
    }
    expect(reads().length).toBe(1)
    reads()[0]!.ok(read(true))
    await tick()
    expect(shown().at(-1)).toBe('done')
    expect(cache.get(list)).toEqual(rows(true))
    document.body.textContent = ''
  }
})

test('a click after a reply keeps the order of the layers left: a dropped newer layer does not resurrect an older one', async () => {
  await ready()
  const a = set({ id: 'a', done: true }), b = set({ id: 'a', done: false }), c = set({ id: 'a', done: true })
  await flush()
  calls[2]!.ok(reply(true))
  await c
  await tick()
  expect(shown()).toEqual(['done']) // not b's `false`, reapplied with c's layer gone
  calls[0]!.ok(reply(true)); calls[1]!.ok(reply(false))
  await Promise.all([a, b])
  await tick()
  reads()[0]!.ok(read(true))
  await tick()
  expect(shown()).toEqual(['done'])
})

test('a call with no prediction overlapping one with: replies in either order end on one read', async () => {
  for (const flip of [false, true]) {
    calls.length = 0
    cache.clear()
    await ready()
    const a = set({ id: 'a', done: true }), b = plain()
    await flush()
    const [first, second] = flip ? [calls[1]!, calls[0]!] : [calls[0]!, calls[1]!]
    first.ok(reply(true)); await tick()
    second.ok(reply(false)); await Promise.all([a, b]); await tick()
    expect(reads().length).toBe(1)
    reads()[0]!.ok(read(true))
    await tick()
    expect(cache.get(list)).toEqual(rows(true))
    document.body.textContent = ''
  }
})

test('calls on different entries do not hold each other up', async () => {
  seed([['rows', undefined, rows(false), ['rows']], ['other', undefined, 1, ['other']]])
  const bump = mutation({ $id: 'bump', invalidates: ['other'], run: () => {} })
  const a = set({ id: 'a', done: true }), b = bump()
  calls[1]!.ok({ t: ['other'], c: [['other', undefined, 2, ['other']]] })
  await b
  expect(cache.get(other)).toBe(2)
  calls[0]!.ok(reply(true))
  await a
  await tick()
  expect(cache.get(list)).toEqual(rows(true))
  expect(reads()).toEqual([])
})

test('a late read does not revert what a mutation brought', async () => {
  await ready()
  void cache.invalidate('rows')
  await tick()
  expect(reads().length).toBe(1)
  const p = plain()
  calls.find(c => c.kind === 'mutate')!.ok(reply(true))
  await p
  await tick()
  expect(shown()).toEqual(['done'])
  reads()[0]!.ok(read(false)) // sent before the write
  await tick()
  expect(shown()).toEqual(['done'])
  expect(reads().length).toBe(1)
})

test('a read that left before an invalidation does not land, and the rerun does not join it', async () => {
  await ready()
  void cache.invalidate('rows')
  await tick()
  void cache.invalidate('rows') // what the first read saw is out of date now
  await tick()
  const [old] = reads()
  old!.ok(read(false))
  await tick()
  expect(reads().length).toBe(2)
  expect(shown()).toEqual(['open'])
  reads()[1]!.ok(read(true))
  await tick()
  expect(shown()).toEqual(['done'])
})

test('a first load in flight, whose tags nothing knows yet, is still invalidated', async () => {
  render(List)
  await tick()
  expect(reads().length).toBe(1)
  void cache.invalidate('rows')
  reads()[0]!.ok(read(false))
  await tick()
  expect(reads().length).toBe(2)
  reads()[1]!.ok(read(true))
  await tick()
  expect(shown()).toEqual(['done'])
})

test('a first load with tags that did not change lands: an invalidation elsewhere reads nothing again', async () => {
  render(List)
  await tick()
  void cache.invalidate('elsewhere')
  reads()[0]!.ok(read(true))
  await tick()
  expect(reads().length).toBe(1)
  expect(shown()).toEqual(['done'])
})

test('a read that lands under a prediction waits: the layer does not apply twice', async () => {
  await ready()
  void cache.invalidate('rows')
  await tick()
  const p = push()
  await flush()
  expect(shown()).toEqual(['open', 'open'])
  reads()[0]!.ok({ v: [...rows(false), { id: 'new', done: false }], t: ['rows'] }) // already holds the row
  await tick()
  expect(shown()).toEqual(['open', 'open'])
  calls.find(c => c.kind === 'mutate')!.ok({ t: ['rows'], c: [['rows', undefined, [...rows(false), { id: 'new', done: false }], ['rows']]] })
  await p
  await tick()
  reads().at(-1)!.ok({ v: [...rows(false), { id: 'new', done: false }], t: ['rows'] })
  await tick()
  expect(shown()).toEqual(['open', 'open'])
})

test('a call whose reply was lost may have committed, so its entry reads again; a refused one has not', async () => {
  await ready()
  const gone = set({ id: 'a', done: true })
  calls[0]!.no(new TypeError('Failed to fetch'))
  await expect(gone).rejects.toThrow('Failed')
  await tick()
  expect(reads().length).toBe(1)
  reads()[0]!.ok(read(true))
  await tick()
  expect(shown()).toEqual(['done'])
  const refused = set({ id: 'a', done: false })
  calls.at(-1)!.no(new FnError({ message: 'no' }, 400))
  await expect(refused).rejects.toThrow('no')
  await tick()
  expect(reads().length).toBe(1)
  expect(shown()).toEqual(['done'])
})

test('a navigation\'s entries older than a write do not land', async () => {
  await ready()
  const since = router.now!()
  const p = plain()
  calls[0]!.ok(reply(true))
  await p
  seed([['rows', undefined, rows(false), ['rows']]], since)
  await tick()
  expect(shown()).toEqual(['done'])
  seed([['rows', undefined, rows(false), ['rows']]], router.now!())
  await tick()
  expect(shown()).toEqual(['open'])
})

test('a streaming page\'s chunks land in the cache as they arrive, under anything written here since', async () => {
  const chunk = (done: boolean) => landed().push({ c: [['rows', undefined, rows(done), ['rows']]], b: {} })
  chunk(true)
  expect(cache.get(list)).toEqual(rows(true))
  await ready(false)
  chunk(true) // read before that value got here
  await tick()
  expect(shown()).toEqual(['open'])
  expect(reads()).toEqual([])
})

test('a gateway\'s 5xx after a write may have committed too, so its entry reads again', async () => {
  await ready()
  const gone = set({ id: 'a', done: true })
  calls[0]!.no(new FnError({ message: 'server function answered 502' }, 502))
  await expect(gone).rejects.toThrow('502')
  await tick()
  expect(reads().length).toBe(1)
  reads()[0]!.ok(read(true))
  await tick()
  expect(shown()).toEqual(['done'])
})

test('a lost write whose read fails too rolls back at once and keeps the list, and reads again when the network returns', async () => {
  seed([['rows', undefined, rows(false), ['rows']]])
  render(Guarded)
  await flush()
  const p = set({ id: 'a', done: true })
  await flush()
  expect(shown()).toEqual(['done'])
  calls[0]!.no(lost())
  await p.catch(() => {})
  await flush()
  expect(shown()).toEqual(['open']) // not when the read answers: it may never
  expect(reads().length).toBe(1)
  reads()[0]!.no(lost())
  await tick()
  expect(shown()).toEqual(['open'])
  expect(screen.queryByText('failed')).toBeNull()
  window.dispatchEvent(new Event('online'))
  await tick()
  expect(reads().length).toBe(2)
  reads()[1]!.ok(read(true)) // it had landed after all
  await tick()
  expect(shown()).toEqual(['done'])
})

test('a tab back after 30 s with the network down keeps its list, and recovers by itself', async () => {
  seed([['rows', undefined, rows(false), ['rows']]])
  render(Guarded)
  await flush()
  returns(focus)
  await tick()
  expect(reads().length).toBe(1)
  reads()[0]!.no(lost())
  await tick()
  expect(shown()).toEqual(['open'])
  await new Promise(ok => { setTimeout(ok, 1100) }) // no `online` event: the server was what went away
  expect(reads().length).toBe(2)
  reads()[1]!.ok(read(true))
  await tick()
  expect(shown()).toEqual(['done'])
})

test('a server that refuses a background read leaves the list, unless it refused the session', async () => {
  seed([['rows', undefined, rows(false), ['rows']]])
  render(Guarded)
  await flush()
  void cache.invalidate('rows')
  await tick()
  reads()[0]!.no(new FnError({ message: 'down' }, 500))
  await tick()
  expect(shown()).toEqual(['open'])
  void cache.invalidate('rows')
  await tick()
  reads().at(-1)!.no(new FnError({ code: 'A002', message: 'signed out' }, 401))
  await tick()
  expect(cache.get(list)).toBeUndefined()
  reads().at(-1)!.no(new FnError({ code: 'A002', message: 'signed out' }, 401))
  await tick()
  expect(screen.getByText('failed')).toBeTruthy()
  expect(screen.queryAllByRole('listitem')).toEqual([])
})

test('a first load with nothing to show takes the error view', async () => {
  render(Guarded)
  await tick()
  reads()[0]!.no(lost())
  await tick()
  expect(screen.getByText('failed')).toBeTruthy()
})

test('showing and focus arriving apart read each entry once', async () => {
  await ready()
  returns(showing)
  await tick()
  returns(focus)
  await tick()
  expect(reads().length).toBe(1)
  reads()[0]!.ok(read(true))
  await tick()
  expect(shown()).toEqual(['done'])
  focus()
  await tick()
  expect(reads().length).toBe(1)
})

test('past the limit no live reader is evicted, and idle entries still go', async () => {
  const live = 1300
  const Row = (p: { i: number }) => { const r = row(() => ({ i: p.i })); return <i>{() => String(r.value)}</i> }
  render(() => <div>{Array.from({ length: live }, (_, i) => <Row i={i} />)}</div>)
  await tick()
  for (const c of reads()) c.ok({ v: 1, t: ['rows'] })
  await tick()
  calls.length = 0
  void cache.invalidate('rows')
  await tick()
  expect(reads().length).toBe(live)
  for (const c of reads()) c.ok({ v: 2, t: ['rows'] })
  await tick()
})

test('past the limit what nothing reads goes, oldest first', () => {
  seed(Array.from({ length: 2000 }, (_, i): Wire => ['row', { i }, i, []]))
  expect(cache.get(row, { i: 0 })).toBeUndefined()
  expect(cache.get(row, { i: 1999 })).toBe(1999)
})

test('two plain calls answered in the same task: neither reply is believed, and one read says what is true', async () => {
  await ready()
  const a = plain(), b = plain()
  calls[0]!.ok(reply(true)); calls[1]!.ok(reply(false))
  await Promise.all([a, b])
  await tick()
  expect(reads().length).toBe(1)
  reads()[0]!.ok(read(true))
  await tick()
  expect(shown()).toEqual(['done'])
})

test('an `optimistic` that throws fails its call and leaves nothing behind', async () => {
  await ready()
  await expect(bad()).rejects.toThrow('bad prediction')
  expect(bad.pending.value).toBe(false)
  const first = plain()
  calls[0]!.ok(reply(true))
  await first
  await tick()
  const second = plain()
  calls[1]!.ok(reply(false))
  await second
  await tick()
  expect(reads()).toEqual([])
  expect(shown()).toEqual(['open'])
})

test('a value read before a write is out of date even for a key the cache did not hold then', async () => {
  await ready()
  const since = router.now!()
  const p = plain()
  calls[0]!.ok({ t: ['rows'], c: [] })
  await p
  await tick()
  router.seed!([['row', { i: 1 }, 'old', ['rows']], ['row', { i: 2 }, 'kept', ['else']]], since)
  expect(await Promise.race([row.fetch({ i: 2 }), Promise.resolve('waits')])).toBe('kept')
  const n = reads().length
  const late = row.fetch({ i: 1 })
  expect(reads().length).toBe(n + 1)
  reads().at(-1)!.ok({ v: 'new', t: ['rows'] })
  expect(await late).toBe('new')
})

test('a stream chunk read before a write is out of date even for a key the cache did not hold then', async () => {
  await ready()
  const p = plain()
  calls[0]!.ok({ t: ['rows'], c: [] })
  await p
  await tick()
  landed().push({ c: [['row', { i: 3 }, 'old', ['rows']]] })
  const n = reads().length
  const late = row.fetch({ i: 3 })
  expect(reads().length).toBe(n + 1)
  reads().at(-1)!.ok({ v: 'new', t: ['rows'] })
  expect(await late).toBe('new')
})

test('a fetch under a prediction reads only after the call behind it answers', async () => {
  seed([['rows', undefined, rows(false), ['rows']]])
  void cache.invalidate('rows')
  const p = set({ id: 'a', done: true })
  expect(await list.fetch()).toEqual(rows(true))
  expect(reads()).toEqual([])
  calls[0]!.ok({ t: ['else'] })
  await p
  await tick()
  expect(reads().length).toBe(1)
  reads()[0]!.ok(read(true))
  await tick()
  expect(cache.get(list)).toEqual(rows(true))
})
