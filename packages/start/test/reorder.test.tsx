// @vitest-environment jsdom
// Replies in any order (research 40 §5): a transport whose answers the test hands out by hand, so a reply can be as late as
// a real one. The fake's one fixed latency can't reorder anything. The final screen has to be the database's state, whichever
// order the network picked.
import { flush, render, screen } from 'weft/test'
import { cache, mutation, query, type StandardSchemaV1 } from '@weft/start'
import { FnError, runtime, seed, type Answer } from '@weft/start/data'
import { client as router } from '../src/router'

type Row = { id: string; done: boolean }
const toggleInput: StandardSchemaV1<{ id: string; done: boolean }> = { '~standard': { version: 1, vendor: 't', validate: (v: any) => ({ value: v }) } }

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

interface Call { kind: string; id: string; input: unknown; ok(a: Answer): void; no(e: unknown): void }
let calls: Call[]
beforeEach(() => {
  calls = []
  const call = (kind: string) => (id: string, input: unknown) => new Promise<Answer>((ok, no) => calls.push({ kind, id, input, ok, no }))
  runtime.transport = { query: call('query'), mutate: call('mutate') }
})
afterEach(() => { runtime.transport = undefined })

const rows = (done: boolean): Row[] => [{ id: 'a', done }]
const reply = (done: boolean): Answer => ({ t: ['rows'], c: [['rows', undefined, rows(done), ['rows']]] })
const read = (done: boolean): Answer => ({ v: rows(done), t: ['rows'] })
const reads = () => calls.filter(c => c.kind === 'query')

function List() {
  const l = list()
  return <ul>{(l.value ?? []).map(r => <li key={r.id}>{r.done ? 'done' : 'open'}</li>)}</ul>
}
const shown = () => screen.getAllByRole('listitem').map(li => li.textContent)
const tick = async () => { await new Promise(ok => setTimeout(ok)); await flush() }

async function ready(done = false) {
  seed([['rows', undefined, rows(done), ['rows']]])
  render(List)
  await flush()
}

test('one call, nothing overlapping: its reply lands and nothing is read again', async () => {
  await ready()
  const p = set({ id: 'a', done: true })
  calls[0].ok(reply(true))
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
  second.ok(reply(false))
  await b
  await tick()
  expect(shown()).toEqual(['open'])
  expect(reads()).toEqual([])
  first.ok(reply(true)) // the older value, last in: it must not show
  await a
  await tick()
  expect(shown()).toEqual(['open'])
  expect(reads().length).toBe(1)
  reads()[0].ok(read(false))
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
      sent[i].ok(reply(want[i]))
      await done[i]
      await tick()
      expect(shown().at(-1)).toBe('done') // the last click, whatever has answered
    }
    expect(reads().length).toBe(1)
    reads()[0].ok(read(true))
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
  calls[2].ok(reply(true))
  await c
  await tick()
  expect(shown()).toEqual(['done']) // not b's `false`, reapplied with c's layer gone
  calls[0].ok(reply(true)); calls[1].ok(reply(false))
  await Promise.all([a, b])
  await tick()
  reads()[0].ok(read(true))
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
    const [first, second] = flip ? [calls[1], calls[0]] : [calls[0], calls[1]]
    first.ok(reply(true)); await tick()
    second.ok(reply(false)); await Promise.all([a, b]); await tick()
    expect(reads().length).toBe(1)
    reads()[0].ok(read(true))
    await tick()
    expect(cache.get(list)).toEqual(rows(true))
    document.body.textContent = ''
  }
})

test('calls on different entries do not hold each other up', async () => {
  seed([['rows', undefined, rows(false), ['rows']], ['other', undefined, 1, ['other']]])
  const bump = mutation({ $id: 'bump', invalidates: ['other'], run: () => {} })
  const a = set({ id: 'a', done: true }), b = bump()
  calls[1].ok({ t: ['other'], c: [['other', undefined, 2, ['other']]] })
  await b
  expect(cache.get(other)).toBe(2)
  calls[0].ok(reply(true))
  await a
  await tick()
  expect(cache.get(list)).toEqual(rows(true))
  expect(reads()).toEqual([])
})

test('a late read does not revert what a mutation brought', async () => {
  await ready()
  cache.invalidate('rows')
  await tick()
  expect(reads().length).toBe(1)
  const p = plain()
  calls.find(c => c.kind === 'mutate')!.ok(reply(true))
  await p
  await tick()
  expect(shown()).toEqual(['done'])
  reads()[0].ok(read(false)) // sent before the write
  await tick()
  expect(shown()).toEqual(['done'])
  expect(reads().length).toBe(1)
})

test('a read that left before an invalidation does not land, and the rerun does not join it', async () => {
  await ready()
  cache.invalidate('rows')
  await tick()
  cache.invalidate('rows') // what the first read saw is out of date now
  await tick()
  const [old] = reads()
  old.ok(read(false))
  await tick()
  expect(reads().length).toBe(2)
  expect(shown()).toEqual(['open'])
  reads()[1].ok(read(true))
  await tick()
  expect(shown()).toEqual(['done'])
})

test('a first load in flight, whose tags nothing knows yet, is still invalidated', async () => {
  render(List)
  await tick()
  expect(reads().length).toBe(1)
  cache.invalidate('rows')
  reads()[0].ok(read(false))
  await tick()
  expect(reads().length).toBe(2)
  reads()[1].ok(read(true))
  await tick()
  expect(shown()).toEqual(['done'])
})

test('a first load with tags that did not change lands: an invalidation elsewhere reads nothing again', async () => {
  render(List)
  await tick()
  cache.invalidate('elsewhere')
  reads()[0].ok(read(true))
  await tick()
  expect(reads().length).toBe(1)
  expect(shown()).toEqual(['done'])
})

test('a read that lands under a prediction waits: the layer does not apply twice', async () => {
  await ready()
  cache.invalidate('rows')
  await tick()
  const p = push()
  await flush()
  expect(shown()).toEqual(['open', 'open'])
  reads()[0].ok({ v: [...rows(false), { id: 'new', done: false }], t: ['rows'] }) // already holds the row
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
  const lost = set({ id: 'a', done: true })
  calls[0].no(new TypeError('Failed to fetch'))
  await expect(lost).rejects.toThrow('Failed')
  await tick()
  expect(reads().length).toBe(1)
  reads()[0].ok(read(true))
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
  calls[0].ok(reply(true))
  await p
  seed([['rows', undefined, rows(false), ['rows']]], since)
  await tick()
  expect(shown()).toEqual(['done'])
  seed([['rows', undefined, rows(false), ['rows']]], router.now!())
  await tick()
  expect(shown()).toEqual(['open'])
})

test('a streaming page\'s chunks land in the cache as they arrive, under anything written here since', async () => {
  const chunk = (done: boolean) => (globalThis as any).$wc.push({ c: [['rows', undefined, rows(done), ['rows']]], b: {} })
  chunk(true)
  expect(cache.get(list)).toEqual(rows(true))
  await ready(false)
  chunk(true) // read before that value got here
  await tick()
  expect(shown()).toEqual(['open'])
  expect(reads()).toEqual([])
})
