// @vitest-environment jsdom
// The client data cache over @weft-js/core/test's fake transport (research 27 §7): queries, dedupe, in-place updates,
// optimistic overlays and rollbacks, single-flight refreshes, the shared tagged cache and the Q/S diagnostics. No
// server and no Vite plugin: the definitions keep their `run`, and calls go to the executor in process.
import type { Loose } from './loose'
import { state } from '@weft-js/core'
import { flush, net, render, screen } from '@weft-js/core/test'
import { cache, mutation, query, redirect, skip, type StandardSchemaV1 } from '@weft-js/start'
import { decodeForm, produce, runtime, share } from '@weft-js/start/data'
import { checkTags } from '../src/exec'

type Todo = { id: string; title: string; done: boolean }
const id: StandardSchemaV1<{ id: string }> = {
  '~standard': { version: 1, vendor: 't', validate: (v: Loose) => (typeof v?.id === 'string' ? { value: v } : { issues: [{ message: 'expected a string', path: ['id'] }] }) },
}

let db: Todo[]
let runs: { list: number; get: number; stats: number }
beforeEach(() => {
  db = [{ id: '1', title: 'One', done: false }, { id: '2', title: 'Two', done: false }, { id: '3', title: 'Three', done: false }]
  runs = { list: 0, get: 0, stats: 0 }
})

const listTodos = query({ $id: 'listTodos', tags: ['todos'], run: () => (runs.list++, db) })
const getTodo = query({ $id: 'getTodo', input: id, tags: t => [`todo:${t.id}`], run: ({ input }) => (runs.get++, db.find(t => t.id === input.id) ?? null) })
const toggle = mutation({
  $id: 'toggle',
  input: id,
  invalidates: ['todos'],
  optimistic: ({ input }, c) => c.update(listTodos, undefined, l => { const t = l.find(x => x.id === input.id); if (t) t.done = !t.done }),
  run: ({ input }) => { const t = db.find(x => x.id === input.id)!; t.done = !t.done; return t },
})
const add = mutation({
  $id: 'add',
  invalidates: ['todos'],
  optimistic: (_, c) => c.update(listTodos, undefined, l => void l.push({ id: 'tmp', title: 'New', done: false })),
  run: () => { const t = { id: String(db.length + 1), title: 'New', done: false }; db.push(t); return t },
})

function List() {
  const todos = listTodos()
  return (
    <ul>
      {(todos.value ?? []).map(t => <li key={t.id} class={t.done ? 'done' : 'open'}>{t.title}</li>)}
    </ul>
  )
}
const classes = () => screen.getAllByRole('listitem').map(li => li.className)

test('a query renders, and two readers of one key share one call', async () => {
  render(() => <><List /><List /></>)
  await net.settle()
  expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['One', 'Two', 'Three', 'One', 'Two', 'Three'])
  expect(net.calls()).toEqual([{ id: 'listTodos', kind: 'query', input: undefined }])
  expect(runs.list).toBe(1)
})

test('an optimistic toggle shows at once, settles with the refreshed list in the same response, and writes 1 attribute', async () => {
  render(List)
  await net.settle()
  net.latency(20)
  let done!: Promise<unknown>
  await expect(async () => {
    done = toggle({ id: '2' })
    await flush()
    expect(classes()).toEqual(['open', 'done', 'open']) // before the server answered
    await done
    await net.settle()
  }).toTouchAtMost(1)
  expect(classes()).toEqual(['open', 'done', 'open'])
  // One mutation, and the list came back with it: no second query call.
  expect(net.calls().map(c => c.id)).toEqual(['listTodos', 'toggle'])
  expect(toggle.pending.value).toBe(false)
})

test('a failed mutation rolls back only its own layer', async () => {
  render(List)
  await net.settle()
  net.latency(20)
  net.fail(toggle, new Error('refused'))
  const first = toggle({ id: '1' })
  const second = toggle({ id: '3' })
  await flush()
  expect(classes()).toEqual(['done', 'open', 'done'])
  await expect(first).rejects.toThrow('refused')
  await second
  await net.settle()
  expect(classes()).toEqual(['open', 'open', 'done'])
  expect((toggle.error.value as Error | undefined)?.message).toBeUndefined() // the later call succeeded
})

test('three quick toggles stack their layers and end where the server ends', async () => {
  render(List)
  await net.settle()
  net.latency(10)
  await Promise.all([toggle({ id: '2' }), toggle({ id: '2' }), toggle({ id: '2' })])
  await net.settle()
  expect(classes()).toEqual(['open', 'done', 'open'])
  expect(db[1]!.done).toBe(true)
})

test('a pushed row is optimistic until the server answers; untouched rows keep their nodes', async () => {
  render(List)
  await net.settle()
  const before = screen.getAllByRole('listitem')
  net.latency(20)
  const p = add()
  await flush()
  expect(screen.getAllByRole('listitem').map(li => li.textContent)).toEqual(['One', 'Two', 'Three', 'New'])
  const optimistic = cache.get(listTodos)!
  expect(cache.isOptimistic(optimistic[3])).toBe(true)
  expect(cache.isOptimistic(optimistic[0])).toBe(false)
  await p
  await net.settle()
  const after = screen.getAllByRole('listitem')
  expect(after.map(li => li.textContent)).toEqual(['One', 'Two', 'Three', 'New'])
  expect(after.slice(0, 3)).toEqual(before) // same elements
  expect(cache.isOptimistic(cache.get(listTodos)![3])).toBe(false)
})

test('tracked input and skip: no call until there is an id, a new id fetches once', async () => {
  const sel = state<string | null>(null)
  function One() {
    const t = getTodo(() => (sel.value ? { id: sel.value } : skip))
    return <p>{t.value?.title ?? 'none'}</p>
  }
  render(One)
  await net.settle()
  expect(screen.getByText('none')).toBeTruthy()
  expect(net.calls()).toEqual([])
  sel.value = '2'
  await net.settle()
  expect(screen.getByText('Two')).toBeTruthy()
  sel.value = '3'
  await net.settle()
  sel.value = '2' // cached
  await net.settle()
  expect(screen.getByText('Two')).toBeTruthy()
  expect(net.calls().map(c => c.input)).toEqual([{ id: '2' }, { id: '3' }])
})

test('S011: an optimistic update its invalidated tags miss warns, and holds until the refetch instead of flashing back', async () => {
  const rename = mutation({
    $id: 'rename',
    input: id,
    invalidates: ['nothing'],
    optimistic: ({ input }, c) => c.update(getTodo, input, t => { t!.title = 'Renamed' }),
    run: ({ input }) => { db.find(t => t.id === input.id)!.title = 'Renamed'; return null },
  })
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  function One() {
    const t = getTodo({ id: '1' })
    return <p>{t.value?.title}</p>
  }
  render(One)
  await net.settle()
  const seen: string[] = []
  const mo = new MutationObserver(() => seen.push(document.querySelector('p')!.textContent))
  mo.observe(document.body, { subtree: true, characterData: true, childList: true })
  await rename({ id: '1' })
  for (let i = 0; i < 5; i++) await net.settle()
  mo.disconnect()
  expect(screen.getByText('Renamed')).toBeTruthy()
  expect(seen).not.toContain('One') // no flash back
  expect(warn.mock.calls.map(c => String(c[0])).join('\n')).toMatch(/S011 `rename`'s optimistic updated `getTodo:\{"id":"1"\}`/)
  warn.mockRestore()
})

test('net.handle replaces a run; net.offline rejects calls', async () => {
  net.handle(listTodos, () => [{ id: 'x', title: 'Faked', done: true }])
  expect(await listTodos.fetch()).toEqual([{ id: 'x', title: 'Faked', done: true }])
  expect(runs.list).toBe(0)
  cache.clear()
  await net.offline()
  await expect(listTodos.fetch()).rejects.toMatchObject({ name: 'OfflineError' })
  await net.online()
})

test('a query fetched outside a component goes through the cache; a mutation refreshes nothing it has no reader for', async () => {
  expect((await listTodos.fetch()).length).toBe(3)
  expect((await listTodos.fetch()).length).toBe(3)
  expect(runs.list).toBe(1)
  await add()
  expect(runs.list).toBe(1) // no reader: marked stale, not refreshed
  expect((await listTodos.fetch()).length).toBe(4)
  expect(runs.list).toBe(2)
})

test('the shared cache (cache: { life }) serves every caller until a mutation invalidates its tag', async () => {
  const stats = query({ $id: 'stats', tags: ['todos'], cache: { life: 'minutes' }, run: () => ({ n: db.length, runs: ++runs.stats }) })
  expect(await stats.fetch()).toEqual({ n: 3, runs: 1 })
  cache.clear() // a fresh client: the server's shared cache still has it
  expect(await stats.fetch()).toEqual({ n: 3, runs: 1 })
  await add()
  cache.clear()
  expect(await stats.fetch()).toEqual({ n: 4, runs: 2 })
})

describe('diagnostics', () => {
  test('Q001: the live form outside a component', () => {
    expect(() => listTodos()).toThrow(/^Q001: `listTodos\(\)` \(a live query\) was called outside a component or scope\n {2}fix: `await listTodos.fetch\(input\)`/)
  })

  test('Q002: input the schema rejects', async () => {
    await expect(getTodo.fetch({ id: 4 as Loose })).rejects.toMatchObject({ code: 'Q002', status: 400, issues: [{ message: 'expected a string', path: ['id'] }] })
  })

  test('Q004: a mutation inside a query (a GET)', async () => {
    const bad = query({ $id: 'bad', run: () => toggle({ id: '1' }) })
    await expect(bad.fetch()).rejects.toMatchObject({ code: 'Q004' })
  })

  test('Q006: a cached query reading the request', async () => {
    const leaky = query({ $id: 'leaky', cache: { life: 60 }, run: ({ ctx }) => ctx.request.headers.get('cookie') })
    await expect(leaky.fetch()).rejects.toMatchObject({ code: 'Q006' })
  })

  test('Q005: a result JSON would change warns', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const dated = query({ $id: 'dated', run: () => ({ at: new Date(0) }) })
    expect(await dated.fetch()).toEqual({ at: '1970-01-01T00:00:00.000Z' }) // what the client really gets
    expect(String(warn.mock.calls[0]?.[0])).toMatch(/^weft: Q005 `dated`'s result\.at is a Date/)
    warn.mockRestore()
  })

  test('Q008: a mutation invalidating a tag no query declares', () => {
    mutation({ $id: 'typo', invalidates: ['todoz'], run: () => null })
    mutation({ $id: 'one', invalidates: ['todo:7'], run: () => null }) // getTodo declares `todo:${id}`
    const found: string[] = []
    checkTags(d => found.push(`${d.code} ${d.message}`))
    expect(found.filter(f => /`(typo|one)`/.test(f))).toEqual(['Q008 `typo` invalidates `todoz`, a tag no query declares: nothing refreshes. Fix the tag, or add it to the query\'s `tags`'])
  })

  test('redirect() in a run navigates the client router', async () => {
    const nav = vi.fn()
    runtime.navigate = nav
    const moved = query({ $id: 'moved', run: () => redirect('/elsewhere') })
    await expect(moved.fetch()).rejects.toMatchObject({ isRedirect: true, href: '/elsewhere' })
    expect(nav).toHaveBeenCalledWith('/elsewhere', true)
    runtime.navigate = undefined
  })
})

test('share keeps equal subtrees; produce copies only what it writes', () => {
  const a = { list: [{ id: 1, tags: ['x'] }, { id: 2, tags: ['y'] }], n: 1 }
  const b = share(a, JSON.parse(JSON.stringify({ ...a, list: [a.list[0], { id: 2, tags: ['z'] }] })))
  expect(b).not.toBe(a)
  expect(b.list[0]).toBe(a.list[0])
  expect(b.list[1]).not.toBe(a.list[1])
  expect(share(a, JSON.parse(JSON.stringify(a)))).toBe(a)

  const c = produce(a, d => { d.list[1]!.tags.push('w') })
  expect(c.list[0]).toBe(a.list[0])
  expect(c.list[1]!.tags).toEqual(['y', 'w'])
  expect(a.list[1]!.tags).toEqual(['y']) // the base is untouched
  expect(produce(a, d => { d.list.find(x => x.id === 1) })).toBe(a) // reads copy nothing
  expect(produce(a, d => ({ ...d, n: 2 })).list).toBe(a.list)
  expect(produce([1, 2, 3], d => { d.splice(1, 1) })).toEqual([1, 3])
})

test("a form field named like an inherited method is a field: `toString` can't reach Object.prototype", () => {
  const form = new FormData()
  form.append('toString', 'a')
  form.append('valueOf[]', 'b')
  form.append('valueOf[]', 'c')
  const fields = decodeForm(form)
  expect(Object.keys(fields).sort((a, b) => a.localeCompare(b))).toEqual(['toString', 'valueOf'])
  expect(Object.values(fields)[1]).toEqual(['b', 'c'])
})
