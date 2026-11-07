import { afterEach, expect, it, vi } from 'vitest'
import { RouteCache } from '../src/run/cache'
import { Prefetch } from '../src/run/prefetch'
import { client, createRouteState, type RoutePayload } from '../src/router'
import type { ClientRoutes } from '../src/run'

const requests = vi.hoisted(() => [] as { path: string; signal: AbortSignal; tag?: string;
  resolve: (response: Response) => void }[])
vi.mock('../src/run/boot', () => ({ streamed: {} }))
vi.mock('../src/run/helpers', async (load) => ({
  ...await load<typeof import('../src/run/helpers')>(),
  ask: (url: URL, signal: AbortSignal, tag?: string) => new Promise<Response>((resolve, reject) => {
    requests.push({ path: url.pathname, signal, ...(tag ? { tag } : {}), resolve })
    signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')),
      { once: true })
  }),
}))
import { Navigation } from '../src/run/navigation'

const headers = { 'cache-control': 'private, max-age=0, stale-while-revalidate=30',
  vary: 'Accept, Cookie, Authorization', etag: '"one"' }
const target = (path: string) => new URL(path, 'http://localhost')
function payload(path: string, code: number | null = 100): RoutePayload {
  return { p: path, s: 200, m: [{ id: path, params: {}, t: ['posts'] }],
    a: { build: 'build', scope: 'vite-static-closure', levels: [{ id: path, bytes: code }],
      routeBytes: code, eagerBytes: 0, combinedBytes: code } }
}
async function seed(cache: RouteCache, path: string, code: number | null = 100) {
  await cache.read(target(path), new AbortController().signal,
    async () => new Response(JSON.stringify(payload(path, code)), { headers }), () => 4, () => true)
}
afterEach(() => {
  requests.length = 0
  document.body.innerHTML = ''
  delete client.now
  delete client.seed
  vi.unstubAllGlobals()
})

it('rejects unknown cost, offline, save-data, slow hover and oversized routes', async () => {
  const cache = new RouteCache('build')
  await seed(cache, '/known')
  await seed(cache, '/unknown', null)
  await seed(cache, '/large', 70 * 1024)
  const spec = new Prefetch(cache, () => 1, () => true)
  spec.start(target('/missing'), 'focus', { effectiveType: '4g' }, true)
  spec.start(target('/unknown'), 'focus', { effectiveType: '4g' }, true)
  spec.start(target('/large'), 'focus', { effectiveType: '4g' }, true)
  spec.start(target('/known'), 'focus', { effectiveType: '4g', saveData: true }, true)
  spec.start(target('/known'), 'focus', { effectiveType: '4g' }, false)
  spec.start(target('/known'), 'hover', { effectiveType: '3g' }, true)
  expect(requests).toHaveLength(0)
  expect(spec.size).toBe(0)
})

it('deduplicates intent and bounds concurrent jobs, then aborts them', async () => {
  const cache = new RouteCache('build')
  for (const path of ['/a', '/b', '/c']) await seed(cache, path)
  const spec = new Prefetch(cache, () => 1, () => true)
  spec.start(target('/a'), 'hover', { effectiveType: '4g' }, true)
  spec.start(target('/a'), 'focus', { effectiveType: '4g' }, true)
  spec.start(target('/b'), 'focus', { effectiveType: '4g' }, true)
  spec.start(target('/c'), 'focus', { effectiveType: '4g' }, true)
  expect(requests).toHaveLength(2)
  expect(requests.map((request) => request.path)).toEqual(['/a', '/b'])
  expect(spec.size).toBe(2)
  spec.cancel(true)
  expect(requests.every((request) => request.signal.aborted)).toBe(true)
  await vi.waitFor(() => expect(spec.size).toBe(0))
})

it('cancels a stream that exceeds its data reservation', async () => {
  const cache = new RouteCache('build')
  await seed(cache, '/a')
  const spec = new Prefetch(cache, () => 1, () => true)
  const cancelled = vi.fn()
  spec.start(target('/a'), 'focus', { effectiveType: '4g' }, true)
  const stream = new ReadableStream<Uint8Array>({
    start(controller) { controller.enqueue(new Uint8Array(8193)) }, cancel: cancelled,
  })
  requests[0]!.resolve(new Response(stream, { headers }))
  await vi.waitFor(() => expect(spec.size).toBe(0))
  expect(cancelled).toHaveBeenCalledOnce()
})

it('promotes an in-flight request to demand without another fetch', async () => {
  history.replaceState(null, '', '/from')
  vi.stubGlobal('requestAnimationFrame', () => 0)
  client.now = () => 8
  client.seed = vi.fn()
  const routes: ClientRoutes = {
    build: 'build', table: [{ id: '/a', pattern: '/a', layouts: [] }], load: {},
  }
  const route = createRouteState({ p: '/from', s: 200, m: [{ id: '/from', params: {} }] }, {})
  const page = {
    route, chunk: vi.fn(async () => {}), island: vi.fn(), setBag: vi.fn(), initialTags: [],
  }
  const nav = new Navigation(routes, page as unknown as ConstructorParameters<typeof Navigation>[1])
  try {
    await seed(nav.cache, '/a')
    nav.prefetch.start(target('/a'), 'focus', { effectiveType: '4g' }, true)
    expect(requests).toHaveLength(1)
    const pending = nav.go('/a', { scroll: false })
    nav.prefetch.cancel()
    expect(requests[0]!.signal.aborted).toBe(false)
    requests[0]!.resolve(new Response(null, { status: 304, headers }))
    await pending
    expect(requests).toHaveLength(1)
    expect(route.levels[0]!.id.value).toBe('/a')
    expect(vi.mocked(client.seed)).not.toHaveBeenCalled()
  } finally { nav.dispose() }
})

it('does not retry or publish after the cache generation changes during a request', async () => {
  const cache = new RouteCache('build')
  await seed(cache, '/a')
  const spec = new Prefetch(cache, () => 1, () => true)
  spec.start(target('/a'), 'focus', { effectiveType: '4g' }, true)
  cache.invalidate(['posts'])
  requests[0]!.resolve(new Response(null, { status: 304, headers }))
  await vi.waitFor(() => expect(spec.size).toBe(0))
  expect(requests).toHaveLength(1)
  expect(cache.peek(target('/a'), true)).toBeUndefined()
})

it('aborts speculative work on production invalidation and disposal', async () => {
  const routes: ClientRoutes = { build: 'build', table: [], load: {} }
  const route = createRouteState({ p: '/from', s: 200, m: [{ id: '/from', params: {} }] }, {})
  const page = { route, chunk: vi.fn(), island: vi.fn(), setBag: vi.fn(), initialTags: [] }
  const nav = new Navigation(routes, page as unknown as ConstructorParameters<typeof Navigation>[1])
  try {
    await seed(nav.cache, '/a')
    nav.prefetch.start(target('/a'), 'focus', { effectiveType: '4g' }, true)
    nav.invalidated(['posts'])
    expect(requests[0]!.signal.aborted).toBe(true)
    await vi.waitFor(() => expect(nav.prefetch.size).toBe(0))
    await seed(nav.cache, '/a')
    nav.prefetch.start(target('/a'), 'focus', { effectiveType: '4g' }, true)
    nav.dispose()
    expect(requests[1]!.signal.aborted).toBe(true)
    await vi.waitFor(() => expect(nav.prefetch.size).toBe(0))
  } finally { nav.dispose() }
})
