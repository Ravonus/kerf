import { AsyncLocalStorage } from 'node:async_hooks'
import { createMemoryHistory } from '@tanstack/history'
import { RouterCore, createNonReactiveMutableStore, createNonReactiveReadonlyStore } from '@tanstack/router-core'
import { expect, it, vi } from 'vitest'
import { routeTree } from '../src/server/routes'
import type { Manifest } from '../src/server/types'
import type { ClientRoutes } from '../src/run'
import { guess } from '../src/run/helpers'
import { createRouteState } from '../src/router'

vi.mock('../src/run/boot', () => ({ streamed: {} }))
import { Navigation } from '../src/run/navigation'

const patterns = ['/users/new', '/users/$id', '/files/$', '/café', '/']
const manifest: Manifest = { dir: 'src/routes', layouts: [
  { id: 'layout:', file: 'root', dir: '' },
  { id: 'layout:users', file: 'users', dir: 'users', parent: 'layout:' },
], routes: patterns.map((pattern) => ({
  id: pattern, file: pattern, pattern,
  layouts: pattern.startsWith('/users/') ? ['layout:', 'layout:users'] : ['layout:'],
  params: [], kind: 'page',
})) }
const routes: ClientRoutes = { table: manifest.routes.map(({ id, pattern, layouts }) =>
  ({ id, pattern, layouts })), load: {} }

async function serverMatch(path: string): Promise<string[]> {
  const tree = routeTree(manifest, {}, new AsyncLocalStorage())
  const router = new RouterCore({ routeTree: tree, history: createMemoryHistory({ initialEntries: [path] }),
    isServer: true, context: {} } as never, () => ({
    createMutableStore: createNonReactiveMutableStore,
    createReadonlyStore: createNonReactiveReadonlyStore,
    batch: (fn: () => void) => fn(),
  }))
  const [branch, params, found] = router.getMatchedRoutes(router.latestLocation.pathname)
  const entry = found?.options as { weft?: { kind?: string } } | undefined
  if (params['**'] || entry?.weft?.kind !== 'page') return []
  return branch.flatMap((item) => {
    const weft = (item.options as { weft?: { id: string } }).weft
    return weft ? [weft.id] : []
  })
}

it.each(['/users/new', '/users/NEW', '/users/alice', '/users/alice/', '/files/a/b',
  '/files/a%2Fb', '/files/a//b', '/files/', '/caf%C3%A9', '/CAF%C3%89', '/users/%XX',
  '/users/%E2%98%83', '/users/a%2Fb', '/users/%252F', '/users/%25', '/files/%E2',
  '/users//alice', '/missing', '/'])(
  'matches the server for %s', async (path) => {
    expect(guess(routes, path)).toEqual(await serverMatch(path))
  },
)


it('prepares the server-selected static shape at the navigation boundary', async () => {
  history.replaceState(null, '', '/users/alice')
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('fetch', vi.fn((_url: string, options: RequestInit) =>
    new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
    })))
  const route = createRouteState({ p: '/users/alice', s: 200, m: [
    { id: 'layout:', params: {} }, { id: 'layout:users', params: {} },
    { id: '/users/$id', params: { id: 'alice' } },
  ] }, {})
  const prepareShape = vi.fn(() => ({ kind: 'generated' as const, ready: true as const,
    completeness: 'partial' as const, component: () => null, release: () => {} }))
  route.prepareShape = prepareShape
  const page = { route, chunk: vi.fn(async () => {}), island: vi.fn(), setBag: vi.fn(),
    initialTags: [] }
  const nav = new Navigation(routes, page as unknown as ConstructorParameters<typeof Navigation>[1])
  try {
    const selected = await serverMatch('/users/NEW')
    const pending = nav.go('/users/NEW', { scroll: false })
    expect(selected).toEqual(['layout:', 'layout:users', '/users/new'])
    expect(prepareShape).toHaveBeenCalledExactlyOnceWith(selected[2])
    expect(route.levels[0]!.shape.value).toBeUndefined()
    expect(route.levels[1]!.shape.value).toBeUndefined()
    expect(route.levels[2]!.shape.value).toHaveLength(1)
    nav.current?.abort()
    await pending
  } finally {
    nav.dispose()
    vi.unstubAllGlobals()
  }
})
