// resource and <Boundary>: §6.2 timing (150 ms, then held 400 ms), errors and retry, and the SSR round trips.
// weft-allow T004, T005: framework test of hydration and resource timing; it reads the server DOM and lets real timers fire
import { screen } from '@testing-library/dom'
import { renderToString, renderToStringAsync } from '@weft-js/core/ssr'
import { hydrate } from '@weft-js/core/dom'
import { flush, render } from '@weft-js/core/test'
import { Boundary, resource, state } from '@weft-js/core'
import { hydration } from '../src/hydrate'
import { Users, type Load } from './fixtures/ssr/Users'
// @ts-expect-error: query imports (vite.mjs)
import { Users as ServerUsers } from './fixtures/ssr/Users.tsx?weft-ssr'
// @ts-expect-error
import { Users as ClientUsers } from './fixtures/ssr/Users.tsx?weft-hydrate'
// @ts-expect-error
import { Cached as ServerCached } from './fixtures/ssr/Cached.tsx?weft-ssr'
// @ts-expect-error
import { Cached as ClientCached } from './fixtures/ssr/Cached.tsx?weft-hydrate'

const names: Record<string, string> = { u1: 'Ada', u2: 'Grace' }

/** A controllable fetch: each call waits `ms` (fake timers), records its abort, and can be made to fail. */
function api(ms: number, fail = false) {
  const calls: { id: string; signal: AbortSignal }[] = []
  const load: Load = (id, signal) => {
    calls.push({ id, signal })
    return new Promise((ok, no) => setTimeout(() => (fail ? no(new Error('offline')) : ok({ name: names[id] })), ms))
  }
  return { load, calls }
}

const text = () => document.querySelector('section')!.textContent
const has = (sel: string) => !!document.querySelector(sel)

beforeEach(() => vi.useFakeTimers())
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

test('fast data: no fallback at all (nothing for the first 150 ms)', async () => {
  const { load } = api(100)
  render(Users, { load })
  expect(has('.skeleton') || has('.profile')).toBe(false)
  await vi.advanceTimersByTimeAsync(100)
  await flush()
  expect(has('.skeleton')).toBe(false)
  expect(text()).toContain('Ada')
})

test('slow data: fallback from 150 ms, held at least 400 ms, then the content swaps in', async () => {
  const { load } = api(200)
  render(Users, { load })
  await vi.advanceTimersByTimeAsync(149)
  expect(has('.skeleton')).toBe(false)
  await vi.advanceTimersByTimeAsync(1)
  expect(has('.skeleton')).toBe(true)
  await vi.advanceTimersByTimeAsync(100) // data lands at 200 ms; the fallback has been up 50 ms
  expect(has('.skeleton')).toBe(true)
  await vi.advanceTimersByTimeAsync(299) // 549 ms
  expect(has('.skeleton')).toBe(true)
  await vi.advanceTimersByTimeAsync(1) // 150 + 400
  await flush()
  expect(has('.skeleton')).toBe(false)
  expect(text()).toContain('Ada')
})

test('a refetch keeps the content (no flash) and aborts the fetch it replaces', async () => {
  const { load, calls } = api(200)
  render(Users, { load })
  await vi.advanceTimersByTimeAsync(600)
  await flush()
  screen.getByRole('button', { name: 'Next' }).click()
  await flush()
  expect(calls.map(c => c.id)).toEqual(['u1', 'u2'])
  await vi.advanceTimersByTimeAsync(300)
  expect(has('.skeleton')).toBe(false) // never back
  await flush()
  expect(text()).toContain('Grace')
})

test('resource: reads before the await are tracked; a superseded fetch is aborted and ignored', async () => {
  const id = state(1)
  const seen: AbortSignal[] = []
  let r!: ReturnType<typeof resource<number>>
  render(() => {
    r = resource(signal => {
      const n = id.value
      seen.push(signal)
      return new Promise<number>(ok => setTimeout(() => ok(n * 10), 50))
    })
    return null
  }, {})
  expect(r.pending).toBe(true)
  id.value = 2
  await flush()
  expect(seen[0].aborted).toBe(true)
  await vi.advanceTimersByTimeAsync(50)
  expect(r.value).toBe(20)
  expect(r.pending).toBe(false)
  r.refresh()
  await flush()
  expect(r.pending).toBe(true)
  expect(r.value).toBe(20) // kept until the new value lands
})

test('error: the error view, then retry refetches into the content', async () => {
  const fails = api(10, true)
  let failing = true
  const load: Load = (id, signal) => (failing ? fails.load(id, signal) : Promise.resolve({ name: names[id] }))
  render(Users, { load })
  await vi.advanceTimersByTimeAsync(10)
  await flush()
  const retry = screen.getByRole('button', { name: 'Retry: offline' })
  failing = false
  retry.click()
  await vi.advanceTimersByTimeAsync(0)
  await flush()
  expect(text()).toContain('Ada')
})

test('SSR, data awaited: the content is in the HTML and hydrates without refetching', async () => {
  vi.useRealTimers()
  const server = api(0)
  const html = await renderToStringAsync(() => ServerUsers({ load: server.load }))
  expect(html).toMatch(/<p wk="[^"]+" class="profile">Ada<\/p>/)
  expect(html).toContain('Ada')
  expect(html).not.toContain('skeleton')
  expect(html).toMatch(/<script type="application\/json" data-weft>.*"Ada".*<\/script>$/)

  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = html
  const before = [...container.querySelectorAll('*')]
  const client = api(0)
  hydrate(() => ClientUsers({ load: client.load }), container)
  expect(hydration.misses).toBe(0)
  expect(before.every(el => el.isConnected)).toBe(true)
  expect(client.calls.every(c => c.signal.aborted)).toBe(true) // tracked, not fetched
  expect(container.querySelector('.profile')!.textContent).toBe('Ada')
  screen.getByRole('button', { name: 'Next' }).click() // the hydrated resource still tracks its reads
  await flush()
  await new Promise(r => setTimeout(r, 5))
  expect(container.querySelector('.profile')!.textContent).toBe('Grace')
})

test('SSR with `data: false`: the value stays out of the page data, and a synchronous read hydrates with 0 writes', async () => {
  vi.useRealTimers()
  // A toy cache, as @weft-js/start's request cache behaves: a promise first, the value itself once it's known.
  const known = new Map<string, { name: string }>()
  const read = (id: string) => known.get(id) ?? new Promise<{ name: string }>(ok => setTimeout(() => { known.set(id, { name: names[id] }); ok(known.get(id)!) }, 1))
  const html = await renderToStringAsync(() => ServerCached({ read }))
  expect(html).toMatch(/^<p wk="[^"]+" class="cached">Ada<\/p>$/) // no data-weft script: nothing recorded

  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = html
  const writes: MutationRecord[] = []
  const mo = new MutationObserver(r => writes.push(...r))
  mo.observe(container, { subtree: true, childList: true, characterData: true, attributes: true })
  const calls: string[] = []
  hydrate(() => ClientCached({ read: (id: string) => (calls.push(id), known.get(id)!) }), container)
  await flush()
  writes.push(...mo.takeRecords())
  mo.disconnect()
  expect(hydration.misses).toBe(0)
  expect(writes).toEqual([])
  expect(calls).toEqual(['u1'])
  expect(container.textContent).toBe('Ada')
})

test('SSR, data not awaited: the fallback hydrates, then the content swaps in after the hold', async () => {
  const html = renderToString(() => ServerUsers({ load: api(0).load }))
  expect(html).toMatch(/<p wk="[^"]+" class="skeleton">/)
  const container = document.body.appendChild(document.createElement('div'))
  container.innerHTML = html
  const skeleton = container.querySelector('.skeleton')!
  hydrate(() => ClientUsers({ load: api(50).load }), container)
  expect(hydration.misses).toBe(0)
  expect(skeleton.isConnected).toBe(true) // the server's fallback is claimed, not replaced
  await vi.advanceTimersByTimeAsync(399)
  expect(skeleton.isConnected).toBe(true)
  await vi.advanceTimersByTimeAsync(1)
  await flush()
  expect(container.querySelector('.skeleton')).toBeNull()
  expect(container.querySelector('.profile')!.textContent).toBe('Ada')
})

describe('a Boundary directly in a conditional hole', () => {
  function setup(view: (open: { value: boolean }, boundary: () => any) => () => any) {
    const open = state(false), mounts: number[] = []
    const load = vi.fn(() => new Promise<string>(ok => setTimeout(() => ok('loaded'), 300)))
    function Spy() {
      mounts.push(1)
      return <i class="wait">wait</i>
    }
    function Inner() {
      const r = resource(() => load())
      return <p class="done">{r.value}</p>
    }
    render(view(open, () => <Boundary pending={<Spy />}><Inner /></Boundary>))
    return { open, load, mounts }
  }

  test.each([
    ['bare', (open: any, B: any) => () => <section>{open.value ? <B /> : null}</section>],
    ['in a fragment', (open: any, B: any) => () => <section>{open.value ? <><b>head</b><B /></> : null}</section>],
  ])('%s: the fallback shows and the Boundary is built once', async (_, view) => {
    const { open, load, mounts } = setup(view)
    open.value = true
    await flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(150)
    await flush()
    expect(has('.wait')).toBe(true)
    expect(mounts).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(400)
    await flush()
    expect(has('.wait')).toBe(false)
    expect(text()).toContain('loaded')
    expect(load).toHaveBeenCalledTimes(1)
    open.value = false
    await flush()
    expect(has('.done')).toBe(false)
    open.value = true
    await flush()
    await vi.advanceTimersByTimeAsync(0)
    expect(load).toHaveBeenCalledTimes(2)
  })
})
