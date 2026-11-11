// The publishing helpers: `cache: { warm }` refills the shared store after an invalidation, a preview request never
// touches the shared store, and `after` runs once the response is finished.
import { AsyncLocalStorage } from 'node:async_hooks'
import { after, mutation, preview, query } from '@kerf-js/start'
import { fnOf, runtime } from '@kerf-js/start/data'
import * as exec from '../src/exec'
import { forgetWarm } from '../src/exec/warm'

const scope = (cookie?: string) =>
  exec.createScope(new Request('http://localhost/', { headers: cookie ? { cookie } : {} }), {
    store: exec.memoryStore(),
  })
/** Run `fn` with `s` as the request in progress, as the server's AsyncLocalStorage would. */
function enter(s: exec.Scope, fn: () => void) {
  const was = runtime.scope
  runtime.scope = () => s
  try {
    fn()
  } finally {
    runtime.scope = was
  }
}
const settle = () =>
  new Promise((r) => {
    setTimeout(r, 5)
  })

afterEach(() => forgetWarm())

test('a warm query runs again in the background when its tag is invalidated, so the next reader hits', async () => {
  let menu = 'old'
  let runs = 0
  const read = fnOf(
    query({
      $id: 'warmMenu',
      tags: ['menu'],
      cache: { life: 'hours', warm: true },
      run: () => (runs++, menu),
    }),
  )
  const store = exec.memoryStore()
  const make = () => exec.createScope(new Request('http://localhost/'), { store })
  expect((await exec.fetchQuery(make(), read, undefined)).v).toBe('old')
  menu = 'new'
  await exec.invalidate(make(), ['menu'])
  await settle()
  expect(runs).toBe(2) // warmed with no reader
  expect((await exec.fetchQuery(make(), read, undefined)).v).toBe('new')
  expect(runs).toBe(2) // and the reader got the warmed value
})

test('a query without warm waits for its next reader', async () => {
  let runs = 0
  const read = fnOf(
    query({ $id: 'coldMenu', tags: ['menu'], cache: { life: 'hours' }, run: () => ++runs }),
  )
  const store = exec.memoryStore()
  const make = () => exec.createScope(new Request('http://localhost/'), { store })
  await exec.fetchQuery(make(), read, undefined)
  await exec.invalidate(make(), ['menu'])
  await settle()
  expect(runs).toBe(1)
})

test('a preview request neither reads nor writes the shared cache', async () => {
  let value = 'published'
  const read = fnOf(
    query({ $id: 'previewMenu', tags: ['menu'], cache: { life: 'hours' }, run: () => value }),
  )
  const store = exec.memoryStore()
  const make = (cookie?: string) =>
    exec.createScope(new Request('http://localhost/', { headers: cookie ? { cookie } : {} }), {
      store,
    })
  expect((await exec.fetchQuery(make(), read, undefined)).v).toBe('published')
  value = 'draft'
  const p = make('a=1; kerf-preview=7')
  expect(p.preview).toBe(true)
  expect((await exec.fetchQuery(p, read, undefined)).v).toBe('draft') // fresh, not the stored value
  value = 'published'
  expect((await exec.fetchQuery(make(), read, undefined)).v).toBe('published') // the draft never reached the store
  expect(scope('kerf-previewx=1').preview).toBe(false)
})

test('after runs once the response body is read to the end, and never before', async () => {
  const s = scope()
  const done: string[] = []
  enter(s, () => after(() => done.push('after')))
  const response = exec.finishing(new Response('page'), s)
  await settle()
  expect(done).toEqual([]) // still streaming
  expect(await response.text()).toBe('page')
  await settle()
  expect(done).toEqual(['after'])
})

test('after runs when the client abandons the stream, and a failure stops none of the rest', async () => {
  const diagnostics: string[] = []
  const s = exec.createScope(new Request('http://localhost/'), {
    onDiagnostic: (d) => diagnostics.push(d.code),
  })
  const done: string[] = []
  enter(s, () => {
    after(() => {
      throw new Error('boom')
    })
    after(() => done.push('second'))
  })
  const body = new ReadableStream({ pull: () => new Promise(() => {}) }) // never ends
  await exec.finishing(new Response(body), s).body!.cancel()
  await settle()
  expect(done).toEqual(['second'])
  expect(diagnostics).toEqual(['E_AFTER'])
  enter(s, () => after(() => done.push('late'))) // after the response: at once
  await settle()
  expect(done).toEqual(['second', 'late'])
})

test("a mutation's refreshes read with the preview the response leaves on, or with none after stop", async () => {
  const seen = () => (preview.id() ? 'draft' : 'live')
  const read = fnOf(query({ $id: 'previewRead', tags: ['menu'], run: seen }))
  const leave = fnOf(
    mutation({ $id: 'previewLeave', invalidates: ['menu'], run: () => preview.stop() }),
  )
  const open = fnOf(
    mutation({ $id: 'previewOpen', invalidates: ['menu'], run: () => preview.start('9') }),
  )
  const post = (cookie: string) =>
    exec.createScope(
      new Request('http://localhost/_kerf', { method: 'POST', headers: { cookie } }),
      { store: exec.memoryStore() },
    )
  const refresh: [string, unknown][] = [[read.$id, undefined]]
  // the server's AsyncLocalStorage, so the scope survives awaits
  const als = new AsyncLocalStorage<exec.Scope>()
  const was = { scope: runtime.scope, enter: runtime.enter }
  runtime.scope = () => als.getStore()
  runtime.enter = (s, fn) => als.run(s as exec.Scope, fn)
  const mutate = (cookie: string, fn: typeof leave) => {
    const s = post(cookie)
    return als.run(s, () => exec.runMutation(s, fn, undefined, refresh))
  }
  try {
    expect((await mutate('s=1; kerf-preview=9', leave)).c?.[0]?.[2]).toBe('live')
    expect((await mutate('s=1', open)).c?.[0]?.[2]).toBe('draft')
  } finally {
    Object.assign(runtime, was)
  }
})
