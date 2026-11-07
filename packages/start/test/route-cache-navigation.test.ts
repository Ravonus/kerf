import { afterEach, expect, it, vi } from 'vitest'
import { client, createRouteState, type RoutePayload } from '../src/router'
import type { ClientRoutes } from '../src/run'

const requests = vi.hoisted(() => [] as { tag: string | undefined; resolve: (r: Response) => void }[])
vi.mock('../src/run/boot', () => ({ streamed: {} }))
vi.mock('../src/run/helpers', async (load) => ({
  ...await load<typeof import('../src/run/helpers')>(),
  ask: (_url: URL, _signal: AbortSignal, tag?: string) => new Promise<Response>((resolve) => {
    requests.push({ tag, resolve })
  }),
}))
import { Navigation } from '../src/run/navigation'

const headers = { 'cache-control': 'private, max-age=0, stale-while-revalidate=30',
  vary: 'Accept, Cookie, Authorization', etag: '"one"' }
function answer(index: number, path: string, value: number, tags: string[] = ['posts']) {
  const payload: RoutePayload = { p: path, s: 200, m: [{ id: path, params: {}, t: tags }],
    c: [['q', null, value, tags]] }
  requests[index]!.resolve(new Response(JSON.stringify(payload), { headers }))
}
function setup() {
  history.replaceState(null, '', '/from')
  vi.stubGlobal('requestAnimationFrame', () => 0)
  const routes: ClientRoutes = { build: 'build', table: ['/from', '/target'].map((id) =>
    ({ id, pattern: id, layouts: [] })), load: {} }
  const route = createRouteState({ p: '/from', s: 200, m: [{ id: '/from', params: {} }] }, {})
  const page = { route, chunk: vi.fn(async () => {}), island: vi.fn(), setBag: vi.fn(), initialTags: [] }
  const nav = new Navigation(routes, page as unknown as ConstructorParameters<typeof Navigation>[1])
  return { nav, route }
}
afterEach(() => {
  requests.length = 0
  document.body.innerHTML = ''
  delete client.now
  delete client.seed
  vi.unstubAllGlobals()
})

it('conditionally validates a revisit and seeds using the original request generation', async () => {
  let generation = 4
  client.now = () => generation
  client.seed = vi.fn()
  const { nav } = setup()
  const first = nav.go('/target', { scroll: false })
  answer(0, '/target', 1)
  await first
  generation = 7
  const back = nav.go('/from', { scroll: false })
  answer(1, '/from', 2)
  await back
  generation = 9
  const revisit = nav.go('/target', { scroll: false })
  expect(requests[2]!.tag).toBe('"one"')
  requests[2]!.resolve(new Response(null, { status: 304, headers }))
  await revisit
  expect(vi.mocked(client.seed).mock.calls.map((args) => args[1])).toEqual([4, 7, 4])
  nav.dispose()
})

it('retries a 304 invalidated while in flight without seeding its old body', async () => {
  let generation = 1
  client.now = () => generation
  client.seed = vi.fn()
  const { nav } = setup()
  const first = nav.go('/target', { scroll: false })
  answer(0, '/target', 1)
  await first
  const back = nav.go('/from', { scroll: false })
  answer(1, '/from', 2, [])
  await back
  const revisit = nav.go('/target', { scroll: false })
  expect(requests[2]!.tag).toBe('"one"')
  generation = 2
  nav.invalidated(['posts'])
  requests[2]!.resolve(new Response(null, { status: 304, headers }))
  await vi.waitFor(() => expect(requests).toHaveLength(4))
  expect(requests[3]!.tag).toBeUndefined()
  answer(3, '/target', 3, [])
  await revisit
  expect(vi.mocked(client.seed).mock.calls.map((args) => args[1])).toEqual([1, 1, 2])
  expect(vi.mocked(client.seed).mock.calls.at(-1)![0]![0]![2]).toBe(3)
  nav.dispose()
})

it('retries a response invalidated while route code is loading', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav } = setup()
  let finish!: () => void
  nav.chunk = vi.fn().mockResolvedValueOnce(undefined)
    .mockImplementationOnce(() => new Promise<void>((resolve) => { finish = resolve }))
    .mockResolvedValue(undefined)
  const pending = nav.go('/target', { scroll: false })
  answer(0, '/target', 1)
  await vi.waitFor(() => expect(finish).toBeTypeOf('function'))
  nav.invalidated(['posts'])
  finish()
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  expect(requests[1]!.tag).toBeUndefined()
  answer(1, '/target', 2, [])
  await pending
  expect(vi.mocked(client.seed).mock.calls).toHaveLength(1)
  expect(vi.mocked(client.seed).mock.calls[0]![0]![0]![2]).toBe(2)
  nav.dispose()
})

it('rejects a response invalidated before a deferred transition swap', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav } = setup()
  nav.fades = true
  nav.painted = true
  const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(false)
  vi.stubGlobal('matchMedia', () => ({ matches: false }))
  let swap!: () => void
  let done!: () => void
  const update = new Promise<void>((resolve) => { done = resolve })
  const before = Object.getOwnPropertyDescriptor(document, 'startViewTransition')
  Object.defineProperty(document, 'startViewTransition', { configurable: true, value: (fn: () => void) => {
    swap = fn
    return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: update }
  } })
  try {
    const pending = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await vi.waitFor(() => expect(swap).toBeTypeOf('function'))
    nav.invalidated(['posts'])
    nav.fades = false
    swap()
    done()
    await vi.waitFor(() => expect(requests).toHaveLength(2))
    expect(client.seed).not.toHaveBeenCalled()
    answer(1, '/target', 2, [])
    await pending
    expect(vi.mocked(client.seed).mock.calls).toHaveLength(1)
    expect(vi.mocked(client.seed).mock.calls[0]![0]![0]![2]).toBe(2)
  } finally {
    nav.dispose()
    hidden.mockRestore()
    if (before) Object.defineProperty(document, 'startViewTransition', before)
    else Reflect.deleteProperty(document, 'startViewTransition')
  }
})

it('clears a pending validation when navigation is disposed', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav } = setup()
  const first = nav.go('/target', { scroll: false })
  answer(0, '/target', 1)
  await first
  const back = nav.go('/from', { scroll: false })
  answer(1, '/from', 2)
  await back
  const revisit = nav.go('/target', { scroll: false })
  expect(requests[2]!.tag).toBe('"one"')
  nav.dispose()
  requests[2]!.resolve(new Response(null, { status: 304, headers }))
  await revisit
  expect(vi.mocked(client.seed).mock.calls).toHaveLength(2)
})

it('retries an in-flight response after a build identity change', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav } = setup()
  const pending = nav.go('/target', { scroll: false })
  nav.routes.build = 'new-build'
  answer(0, '/target', 1)
  await vi.waitFor(() => expect(requests).toHaveLength(2))
  expect(client.seed).not.toHaveBeenCalled()
  expect(requests[1]!.tag).toBeUndefined()
  answer(1, '/target', 2)
  await pending
  expect(vi.mocked(client.seed).mock.calls[0]![0]![0]![2]).toBe(2)
  nav.dispose()
})

it('aborts a pending refresh when its session is disposed', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav } = setup()
  const refresh = nav.refresh(['posts'])
  expect(requests).toHaveLength(1)
  nav.dispose()
  answer(0, '/from', 9)
  await refresh
  expect(client.seed).not.toHaveBeenCalled()
})
