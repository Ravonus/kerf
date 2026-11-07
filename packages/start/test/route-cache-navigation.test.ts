// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}
import type * as ActualHelpers from '../src/run/helpers'
import { afterEach, expect, it, vi } from 'vitest'
import { client, createRouteState, type RoutePayload } from '../src/router'
import type { ClientRoutes } from '../src/run'

import { Navigation } from '../src/run/navigation'
const requests = vi.hoisted(
  () =>
    [] as {
      tag: string | undefined
      resolve: (r: Response) => void
      reject: (error: Error) => void
    }[],
)
vi.mock('../src/run/boot', () => ({ streamed: {} }))
vi.mock('../src/run/helpers', async (load) => ({
  ...(await load<typeof ActualHelpers>()),
  ask: (_url: URL, _signal: AbortSignal, tag?: string) =>
    new Promise<Response>((resolve, reject) => {
      requests.push({ tag, resolve, reject })
    }),
}))

const headers = {
  'cache-control': 'private, max-age=0, stale-while-revalidate=30',
  vary: 'Accept, Cookie, Authorization',
  etag: '"one"',
}
function answer(index: number, path: string, value: number, tags: string[] = ['posts']) {
  const payload: RoutePayload = {
    p: path,
    s: 200,
    m: [{ id: path, params: {}, t: tags }],
    c: [['q', null, value, tags]],
  }
  requests[index]!.resolve(new Response(JSON.stringify(payload), { headers }))
}
function setup(ready = false) {
  history.replaceState(null, '', '/from')
  vi.stubGlobal('requestAnimationFrame', () => 0)
  const routes: ClientRoutes = {
    build: 'build',
    table: ['/from', '/target', '/private', '/other'].map((id) => ({
      id,
      pattern: id,
      layouts: [],
    })),
    load: {},
  }
  const route = createRouteState({ p: '/from', s: 200, m: [{ id: '/from', params: {} }] }, {})
  const page = {
    route,
    chunk: vi.fn(async () => {}),
    island: vi.fn(),
    setBag: vi.fn(),
    ready: () => ready,
    initialTags: [],
  }
  const nav = new Navigation(routes, page)
  return { nav, route }
}
afterEach(() => {
  requests.length = 0
  document.body.innerHTML = ''
  delete client.now
  delete client.seed
  delete client.refreshed
  delete client.sessionChanged
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
  expect(vi.mocked(client.seed).mock.calls.at(-1)![0][0]![2]).toBe(3)
  nav.dispose()
})

it('retries a response invalidated while route code is loading', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav } = setup()
  let finish!: () => void
  nav.chunk = vi
    .fn()
    .mockResolvedValueOnce(undefined)
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = resolve
        }),
    )
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
  expect(vi.mocked(client.seed).mock.calls[0]![0][0]![2]).toBe(2)
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
  const update = new Promise<void>((resolve) => {
    done = resolve
  })
  const before = Object.getOwnPropertyDescriptor(document, 'startViewTransition')
  Object.defineProperty(document, 'startViewTransition', {
    configurable: true,
    value: (fn: () => void) => {
      swap = fn
      return { ready: Promise.resolve(), finished: Promise.resolve(), updateCallbackDone: update }
    },
  })
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
    expect(vi.mocked(client.seed).mock.calls[0]![0][0]![2]).toBe(2)
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
  expect(vi.mocked(client.seed).mock.calls[0]![0][0]![2]).toBe(2)
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

it.each([401, 403])(
  'clears other protected validators for a 200/%s auth envelope',
  async (status) => {
    client.now = () => 1
    client.seed = vi.fn()
    const { nav, route } = setup()
    const first = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await first
    const second = nav.go('/private', { scroll: false })
    answer(1, '/private', 2)
    await second
    const cachedFirst = nav.go('/target', { scroll: false })
    expect(requests[2]!.tag).toBe('"one"')
    requests[2]!.resolve(new Response(null, { status: 304, headers }))
    await cachedFirst
    const cachedSecond = nav.go('/private', { scroll: false })
    expect(requests[3]!.tag).toBe('"one"')
    requests[3]!.resolve(new Response(null, { status: 304, headers }))
    await cachedSecond
    const forbidden = nav.go('/other', { scroll: false })
    const payload: RoutePayload = {
      p: '/other',
      s: status,
      m: [{ id: '/other', params: {}, data: 'denied' }],
    }
    requests[4]!.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'cache-control': 'no-store' },
      }),
    )
    await forbidden
    expect(route.status.value).toBe(status)
    expect(route.levels[0]!.data.value).toBe('denied')
    const revisitFirst = nav.go('/target', { scroll: false })
    expect(requests[5]!.tag).toBeUndefined()
    answer(5, '/target', 3)
    await revisitFirst
    const revisitSecond = nav.go('/private', { scroll: false })
    expect(requests[6]!.tag).toBeUndefined()
    answer(6, '/private', 4)
    await revisitSecond
    nav.dispose()
  },
)

it.each(['dispose', 'session', 'invalidation', 'hmr'] as const)(
  'does not publish a reloaded response invalidated during JSON parsing: %s',
  async (reason) => {
    const { nav } = setup()
    client.refreshed = vi.fn()
    const go = vi.spyOn(nav, 'go').mockResolvedValue()
    let resolveBody!: (value: { s: number }) => void
    const body = new Promise<{ s: number }>((resolve) => {
      resolveBody = resolve
    })
    const response = new Response('{}')
    const clone = vi.spyOn(response, 'clone').mockReturnValue({ json: () => body } as Response)
    const pending = nav.reloaded({ queries: true })
    requests[0]!.resolve(response)
    await vi.waitFor(() => expect(clone).toHaveBeenCalledOnce())
    let newer: Promise<void> | undefined
    if (reason === 'dispose') nav.dispose()
    else if (reason === 'session') {
      client.sessionChanged = nav.dispose
      client.sessionChanged()
    } else if (reason === 'invalidation') nav.invalidated(['other'])
    else {
      newer = nav.reloaded({ queries: true })
      requests[1]!.resolve(new Response(null, { status: 500 }))
      await newer
    }
    resolveBody({ s: 200 })
    await pending
    expect(client.refreshed).not.toHaveBeenCalled()
    expect(nav.prefetch.size).toBe(0)
    expect(go).not.toHaveBeenCalled()
    nav.dispose()
  },
)

it('renders a reloaded authorization envelope after clearing its validators', async () => {
  const { nav, route } = setup()
  client.refreshed = vi.fn()
  const pending = nav.reloaded({ queries: true })
  const payload: RoutePayload = {
    p: '/from',
    s: 403,
    m: [{ id: '/from', params: {}, data: 'denied' }],
  }
  requests[0]!.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: { 'cache-control': 'no-store' },
    }),
  )
  await pending
  expect(route.status.value).toBe(403)
  expect(route.levels[0]!.data.value).toBe('denied')
  expect(requests).toHaveLength(1)
  nav.dispose()
})

it('clears cached validators and renders a refresh authorization envelope', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav, route } = setup()
  try {
    const first = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await first
    const second = nav.go('/private', { scroll: false })
    answer(1, '/private', 2)
    await second
    const refresh = nav.refresh(['posts'])
    const payload: RoutePayload = {
      p: '/private',
      s: 403,
      m: [{ id: '/private', params: {}, data: 'denied' }],
    }
    requests[2]!.resolve(
      new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'cache-control': 'no-store' },
      }),
    )
    await refresh
    expect(route.status.value).toBe(403)
    expect(route.levels[0]!.data.value).toBe('denied')
    const revisit = nav.go('/target', { scroll: false })
    expect(requests[3]!.tag).toBeUndefined()
    answer(3, '/target', 3)
    await revisit
  } finally {
    nav.dispose()
  }
})

it('does not publish HMR warm state after a reentrant refresh callback clears it', async () => {
  const { nav } = setup()
  const go = vi.spyOn(nav, 'go').mockResolvedValue()
  client.refreshed = () => nav.dispose()
  const pending = nav.reloaded({ queries: true })
  requests[0]!.resolve(new Response(JSON.stringify({ p: '/from', s: 200, m: [] })))
  await pending
  expect(nav.prefetch.size).toBe(0)
  expect(go).not.toHaveBeenCalled()
})

it('does not publish warm state when the refresh callback changes only the build', async () => {
  const { nav } = setup()
  const go = vi.spyOn(nav, 'go').mockResolvedValue()
  client.refreshed = () => {
    nav.routes.build = 'new-build'
  }
  const pending = nav.reloaded({ queries: true })
  requests[0]!.resolve(new Response(JSON.stringify({ p: '/from', s: 200, m: [] })))
  await pending
  expect(nav.prefetch.size).toBe(0)
  expect(go).not.toHaveBeenCalled()
  nav.dispose()
})
