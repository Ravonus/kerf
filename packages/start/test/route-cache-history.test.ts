import { afterEach, expect, it, vi } from 'vitest'
import { client, createRouteState, type RoutePayload } from '../src/router'
import type { ClientRoutes } from '../src/run'

const requests = vi.hoisted(() => [] as { tag: string | undefined; resolve: (r: Response) => void;
  reject: (error: Error) => void }[])
vi.mock('../src/run/boot', () => ({ streamed: {} }))
vi.mock('../src/run/helpers', async (load) => ({
  ...await load<typeof import('../src/run/helpers')>(),
  ask: (_url: URL, _signal: AbortSignal, tag?: string) => new Promise<Response>((resolve, reject) => {
    requests.push({ tag, resolve, reject })
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
function setup(ready = false) {
  history.replaceState(null, '', '/from')
  vi.stubGlobal('requestAnimationFrame', () => 0)
  const routes: ClientRoutes = { build: 'build', table: ['/from', '/target', '/private', '/other'].map((id) =>
    ({ id, pattern: id, layouts: [] })), load: {} }
  const route = createRouteState({ p: '/from', s: 200, m: [{ id: '/from', params: {} }] }, {})
  const page = { route, chunk: vi.fn(async () => {}), island: vi.fn(), setBag: vi.fn(),
    ready: () => ready, initialTags: [] }
  const nav = new Navigation(routes, page as unknown as ConstructorParameters<typeof Navigation>[1])
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


it('renders a usable history entry before delayed revalidation', async () => {
  let generation = 4
  client.now = () => generation
  client.seed = vi.fn()
  const { nav, route } = setup(true)
  try {
    const first = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await first
    generation = 7
    const away = nav.go('/from', { scroll: false })
    answer(1, '/from', 2, [])
    await away
    generation = 9
    history.pushState(null, '', '/target')
    const back = nav.go('/target', { pop: true, scroll: false })
    expect(route.levels[0]!.id.value).toBe('/target')
    expect(vi.mocked(client.seed).mock.calls.map((args) => args[1])).toEqual([4, 7, 4])
    expect(requests[2]!.tag).toBe('"one"')
    requests[2]!.resolve(new Response(null, { status: 304, headers }))
    await back
    expect(vi.mocked(client.seed).mock.calls).toHaveLength(3)
  } finally { nav.dispose() }
})

it('waits for validation if history code is not known to be loaded', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav, route } = setup(false)
  try {
    const first = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await first
    const away = nav.go('/from', { scroll: false })
    answer(1, '/from', 2, [])
    await away
    history.pushState(null, '', '/target')
    const back = nav.go('/target', { pop: true, scroll: false })
    expect(route.levels[0]!.id.value).toBe('/from')
    requests[2]!.resolve(new Response(null, { status: 304, headers }))
    await back
    expect(route.levels[0]!.id.value).toBe('/target')
  } finally { nav.dispose() }
})

it('does not render an invalidated history entry before validation', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav, route } = setup(true)
  try {
    const first = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await first
    const away = nav.go('/from', { scroll: false })
    answer(1, '/from', 2, [])
    await away
    nav.invalidated(['posts'])
    history.pushState(null, '', '/target')
    const back = nav.go('/target', { pop: true, scroll: false })
    expect(route.levels[0]!.id.value).toBe('/from')
    expect(requests[2]!.tag).toBeUndefined()
    answer(2, '/target', 3, [])
    await back
    expect(route.levels[0]!.id.value).toBe('/target')
  } finally { nav.dispose() }
})

it('ignores an old background validation after replacement', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav, route } = setup(true)
  try {
    const first = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await first
    const away = nav.go('/from', { scroll: false })
    answer(1, '/from', 2, [])
    await away
    history.pushState(null, '', '/target')
    const back = nav.go('/target', { pop: true, scroll: false })
    expect(route.levels[0]!.id.value).toBe('/target')
    const replaced = nav.go('/other', { scroll: false })
    answer(3, '/other', 4, [])
    await replaced
    answer(2, '/target', 99)
    await back
    expect(route.levels[0]!.id.value).toBe('/other')
    expect(location.pathname).toBe('/other')
    expect(vi.mocked(client.seed).mock.calls.at(-1)![0]![0]![2]).toBe(4)
  } finally { nav.dispose() }
})


it('replaces invalidated cached content with a shape before stale validation returns', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav, route } = setup(true)
  route.prepareShape = () => ({ kind: 'generated', ready: true, completeness: 'partial',
    component: () => null, release: () => {} })
  try {
    const first = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await first
    const away = nav.go('/from', { scroll: false })
    answer(1, '/from', 2, [])
    await away
    history.pushState(null, '', '/target')
    const back = nav.go('/target', { pop: true, scroll: false })
    expect(route.levels[0]!.id.value).toBe('/target')
    expect(route.levels[0]!.shape.value).toBeUndefined()
    nav.invalidated(['posts'])
    expect(route.levels[0]!.shape.value).toHaveLength(1)
    requests[2]!.resolve(new Response(null, { status: 304, headers }))
    await vi.waitFor(() => expect(requests).toHaveLength(4))
    expect(requests[3]!.tag).toBeUndefined()
    answer(3, '/target', 3, [])
    await back
    expect(route.levels[0]!.shape.value).toBeUndefined()
    expect(vi.mocked(client.seed).mock.calls.at(-1)![0]![0]![2]).toBe(3)
  } finally { nav.dispose() }
})

it('retains permitted cached content and retries a failed validation', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav, route } = setup(true)
  try {
    const first = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await first
    const away = nav.go('/from', { scroll: false })
    answer(1, '/from', 2, [])
    await away
    history.pushState(null, '', '/target')
    const back = nav.go('/target', { pop: true, scroll: false })
    requests[2]!.reject(new Error('offline'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(route.levels[0]!.id.value).toBe('/target')
    await vi.waitFor(() => expect(requests).toHaveLength(4), { timeout: 2000 })
    requests[3]!.resolve(new Response(null, { status: 304, headers }))
    await back
    expect(route.levels[0]!.id.value).toBe('/target')
  } finally { nav.dispose() }
})

it('replaces the cached presentation with a shape when its permission expires', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav, route } = setup(true)
  route.prepareShape = () => ({ kind: 'generated', ready: true, completeness: 'partial',
    component: () => null, release: () => {} })
  try {
    const first = nav.go('/target', { scroll: false })
    const payload: RoutePayload = { p: '/target', s: 200, m: [{ id: '/target', params: {} }] }
    requests[0]!.resolve(new Response(JSON.stringify(payload), { headers: { ...headers,
      'cache-control': 'private, max-age=0, stale-while-revalidate=1' } }))
    await first
    const away = nav.go('/from', { scroll: false })
    answer(1, '/from', 2, [])
    await away
    history.pushState(null, '', '/target')
    const back = nav.go('/target', { pop: true, scroll: false })
    expect(route.levels[0]!.id.value).toBe('/target')
    expect(route.levels[0]!.shape.value).toBeUndefined()
    await vi.waitFor(() => expect(route.levels[0]!.shape.value).toHaveLength(1), { timeout: 2000 })
    requests[2]!.resolve(new Response(null, { status: 304, headers }))
    await back
    expect(route.levels[0]!.shape.value).toBeUndefined()
  } finally { nav.dispose() }
})

it('shows the authorization response after an immediately rendered history entry', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav, route } = setup(true)
  try {
    const first = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await first
    const away = nav.go('/from', { scroll: false })
    answer(1, '/from', 2, [])
    await away
    history.pushState(null, '', '/target')
    const back = nav.go('/target', { pop: true, scroll: false })
    expect(route.levels[0]!.id.value).toBe('/target')
    const denied: RoutePayload = { p: '/target', s: 403,
      m: [{ id: '/target', params: {}, data: 'denied' }] }
    requests[2]!.resolve(new Response(JSON.stringify(denied), { status: 200,
      headers: { 'cache-control': 'no-store' } }))
    await back
    expect(route.status.value).toBe(403)
    expect(route.levels[0]!.data.value).toBe('denied')
  } finally { nav.dispose() }
})

it('updates an immediate history entry from a guarded 200 without another history write', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav, route } = setup(true)
  try {
    const first = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await first
    const away = nav.go('/from', { scroll: false })
    answer(1, '/from', 2, [])
    await away
    history.pushState(null, '', '/target')
    const length = history.length
    const back = nav.go('/target', { pop: true, scroll: false })
    expect(route.levels[0]!.id.value).toBe('/target')
    answer(2, '/target', 3, [])
    await back
    expect(vi.mocked(client.seed).mock.calls.at(-1)![0]![0]![2]).toBe(3)
    expect(history.length).toBe(length)
    expect(location.pathname).toBe('/target')
  } finally { nav.dispose() }
})

it('hides the cached entry when a 304 revokes retention permission', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav, route } = setup(true)
  route.prepareShape = () => ({ kind: 'generated', ready: true, completeness: 'partial',
    component: () => null, release: () => {} })
  try {
    const first = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await first
    const away = nav.go('/from', { scroll: false })
    answer(1, '/from', 2, [])
    await away
    history.pushState(null, '', '/target')
    const back = nav.go('/target', { pop: true, scroll: false })
    expect(route.levels[0]!.shape.value).toBeUndefined()
    requests[2]!.resolve(new Response(null, { status: 304, headers: {
      ...headers, 'cache-control': 'no-store',
    } }))
    await vi.waitFor(() => expect(requests).toHaveLength(4))
    expect(route.levels[0]!.shape.value).toHaveLength(1)
    expect(requests[3]!.tag).toBeUndefined()
    answer(3, '/target', 3, [])
    await back
    expect(route.levels[0]!.shape.value).toBeUndefined()
  } finally { nav.dispose() }
})

it('cancels a failed-validation retry when a newer navigation starts', async () => {
  client.now = () => 1
  client.seed = vi.fn()
  const { nav, route } = setup(true)
  try {
    const first = nav.go('/target', { scroll: false })
    answer(0, '/target', 1)
    await first
    const away = nav.go('/from', { scroll: false })
    answer(1, '/from', 2, [])
    await away
    history.pushState(null, '', '/target')
    const back = nav.go('/target', { pop: true, scroll: false })
    requests[2]!.reject(new Error('offline'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    const newer = nav.go('/other', { scroll: false })
    await back
    answer(3, '/other', 4, [])
    await newer
    expect(requests).toHaveLength(4)
    expect(route.levels[0]!.id.value).toBe('/other')
  } finally { nav.dispose() }
})
