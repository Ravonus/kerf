import { AsyncLocalStorage } from 'node:async_hooks'
import { createMemoryHistory } from '@tanstack/history'
import {
  RouterCore,
  createNonReactiveMutableStore,
  createNonReactiveReadonlyStore,
  notFound,
  redirect as routerRedirect,
} from '@tanstack/router-core'
import { expect, it, vi } from 'vitest'
import { routeTree } from '../src/server/routes'
import type { Manifest, RouteModule } from '../src/server/types'
import { redirect } from '../src/data'
import type { Scope } from '../src/exec'
import type { ClientRoutes } from '../src/run'
import { guess } from '../src/run/helpers'
import { createRouteState } from '../src/router'
import { Navigation } from '../src/run/navigation'

vi.mock('../src/run/boot', () => ({ streamed: {} }))
vi.mock('../src/server/page-cold', () => ({ coldPage: vi.fn() }))
vi.mock('../src/server/page-warm', () => ({ warmPage: vi.fn() }))
vi.mock('../src/view', () => ({ App: vi.fn() }))

const patterns = ['/users/new', '/users/$id', '/files/$', '/café', '/']
const manifest: Manifest = {
  dir: 'src/routes',
  layouts: [
    { id: 'layout:', file: 'root', dir: '' },
    { id: 'layout:users', file: 'users', dir: 'users', parent: 'layout:' },
  ],
  routes: patterns.map((pattern) => ({
    id: pattern,
    file: pattern,
    pattern,
    layouts: pattern.startsWith('/users/') ? ['layout:', 'layout:users'] : ['layout:'],
    params: [],
    kind: 'page',
  })),
}
const routes: ClientRoutes = {
  table: manifest.routes.map(({ id, pattern, layouts }) => ({ id, pattern, layouts })),
  load: {},
}

function serverRouter(path: string) {
  const tree = routeTree(manifest, {}, new AsyncLocalStorage())
  const router = new RouterCore(
    {
      routeTree: tree,
      history: createMemoryHistory({ initialEntries: [path] }),
      isServer: true,
      context: {},
    } as never,
    () => ({
      createMutableStore: createNonReactiveMutableStore,
      createReadonlyStore: createNonReactiveReadonlyStore,
      batch: (fn: () => void) => fn(),
    }),
  )
  return router
}

// oxlint-disable-next-line typescript/require-await -- the mocked contract returns a Promise
async function serverMatch(path: string): Promise<string[]> {
  const router = serverRouter(path)
  const [branch, params, found] = router.getMatchedRoutes(router.latestLocation.pathname)
  const entry = found?.options as { weft?: { kind?: string } } | undefined
  if (params['**'] || entry?.weft?.kind !== 'page') return []
  return branch.flatMap((item) => {
    const weft = (item.options as { weft?: { id: string } }).weft
    return weft ? [weft.id] : []
  })
}

it.each([
  '/users/new',
  '/users/NEW',
  '/users/alice',
  '/files/a/b',
  '/files/a%2Fb',
  '/files/a//b',
  '/caf%C3%A9',
  '/CAF%C3%89',
  '/users/%XX',
  '/users/%E2%98%83',
  '/users/a%2Fb',
  '/users/%252F',
  '/users/%25',
  '/files/%E2',
  '/users//alice',
  '/missing',
  '/',
])('matches the pre-load server trie for %s', async (path) => {
  expect(guess(routes, path)).toEqual(await serverMatch(path))
})

it('prepares the server-selected static shape at the navigation boundary', async () => {
  history.replaceState(null, '', '/users/alice')
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal(
    'fetch',
    vi.fn(
      (_url: string, options: RequestInit) =>
        new Promise((_resolve, reject) => {
          options.signal?.addEventListener('abort', () => reject(new Error('aborted')), {
            once: true,
          })
        }),
    ),
  )
  const route = createRouteState(
    {
      p: '/users/alice',
      s: 200,
      m: [
        { id: 'layout:', params: {} },
        { id: 'layout:users', params: {} },
        { id: '/users/$id', params: { id: 'alice' } },
      ],
    },
    {},
  )
  const prepareShape = vi.fn(() => ({
    kind: 'generated' as const,
    ready: true as const,
    completeness: 'partial' as const,
    component: () => null,
    release: () => {},
  }))
  route.prepareShape = prepareShape
  const page = {
    route,
    chunk: vi.fn(async () => {}),
    island: vi.fn(),
    setBag: vi.fn(),
    initialTags: [],
  }
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

async function finalResolution(path: string, modules: Record<string, RouteModule> = {}) {
  const { resolveRoute } = await import('../src/server/resolver')
  const als = new AsyncLocalStorage<Scope>()
  const options = { manifest, modules }
  return resolveRoute(
    {
      als,
      scopeOptions: {},
      tree: routeTree(manifest, modules, als),
      site: {},
      manifest,
      byId: new Map(manifest.routes.map((route) => [route.id, route])),
      mod: (file) => (file ? modules[file] : undefined),
      comps: {},
      options,
      originOf: () => undefined,
    },
    path,
    new Request(`http://localhost${path}`),
  )
}

it.each([
  '/users/new',
  '/users/NEW',
  '/users/alice',
  '/users//alice',
  '/missing',
  '/files/a%2Fb',
  '/users/%XX',
  '/',
])('agrees with final resolver for %s', async (path) => {
  const resolved = await finalResolution(path)
  expect(guess(routes, path)).toEqual(
    resolved.status === 200 ? resolved.levels.map((level) => level.id) : [],
  )
})

it('returns the canonical redirect instead of a trailing-slash 404', async () => {
  expect(await serverMatch('/users/alice/')).toEqual(['layout:', 'layout:users', '/users/$id'])
  const router = serverRouter('/users/alice/')
  await router.load()
  expect(router._serverResult?.type).toBe('redirect')
  if (router._serverResult?.type !== 'redirect') throw new Error('expected canonical redirect')
  expect(router._serverResult.redirect.headers.get('location')).toBe('/users/alice')
  const final = await finalResolution('/users/alice/')
  expect(final.status).toBe(307)
  expect(final.redirect?.href).toBe('/users/alice')
  expect(final.levels).toEqual([])
  expect(guess(routes, '/users/alice/')).toEqual([])
})

it('reports a loader redirect after the pre-load route match', async () => {
  const result = await finalResolution('/users/new', {
    '/users/new': { load: () => redirect('/users/alice') },
  })
  expect(result.status).toBe(307)
  expect(result.redirect?.href).toBe('/users/alice')
  expect(result.levels).toEqual([])
  expect(guess(routes, '/users/new')).toEqual(['layout:', 'layout:users', '/users/new'])
})

it('reports a loader not-found after the pre-load route match', async () => {
  const result = await finalResolution('/users/new', {
    '/users/new': {
      load: () => {
        // oxlint-disable-next-line typescript/only-throw-error -- loaders throw weft's notFound()/redirect() results by design
        throw notFound()
      },
    },
  })
  expect(result.status).toBe(404)
  expect(result.levels.at(-1)?.id).toBe('404')
  expect(guess(routes, '/users/new')).toEqual(['layout:', 'layout:users', '/users/new'])
})

it.each([
  ['/users/alice/?tab=posts', '/users/alice?tab=posts'],
  ['/users/alice/?tab=posts#section', '/users/alice?tab=posts#section'],
])('keeps query and hash in canonical redirect from %s', async (path, destination) => {
  const final = await finalResolution(path)
  expect(final.status).toBe(307)
  expect(final.redirect?.href).toBe(destination)
})

it('preserves router redirect status and headers from a loader', async () => {
  const result = await finalResolution('/users/new', {
    '/users/new': {
      load: () => {
        // oxlint-disable-next-line typescript/only-throw-error -- loaders throw weft's notFound()/redirect() results by design
        throw routerRedirect({
          href: '/users/alice',
          statusCode: 302,
          headers: { 'x-route': 'yes' },
        })
      },
    },
  })
  expect(result.status).toBe(302)
  expect(result.redirect?.href).toBe('/users/alice')
  expect(result.redirectHeaders?.get('x-route')).toBe('yes')
})

it('keeps a genuine unknown path as not found', async () => {
  const result = await finalResolution('/missing')
  expect(result.status).toBe(404)
  expect(result.redirect).toBeUndefined()
  expect(result.levels.at(-1)?.id).toBe('404')
})

it('delivers router redirect headers and request-scope headers on both response paths', async () => {
  const { makePage } = await import('../src/server/page')
  const { makeNavigation } = await import('../src/server/navigation')
  const { createScope } = await import('../src/exec')
  const result = await finalResolution('/users/new', {
    '/users/new': {
      load: () => {
        // oxlint-disable-next-line typescript/only-throw-error -- loaders throw weft's notFound()/redirect() results by design
        throw routerRedirect({
          href: '/users/alice',
          statusCode: 302,
          headers: { 'x-route': 'yes' },
        })
      },
    },
  })
  const request = new Request('http://localhost/users/new')
  const scope = createScope(request)
  scope.headers.append('set-cookie', 'session=ok; Path=/')
  // oxlint-disable-next-line typescript/require-await -- the mocked contract returns a Promise
  const resolve = async () => result
  const page = makePage({ resolve } as never)
  const pageResponse = await page(new URL(request.url), request, scope)
  expect(pageResponse.status).toBe(302)
  expect(pageResponse.headers.get('location')).toBe('/users/alice')
  expect(pageResponse.headers.get('x-route')).toBe('yes')
  expect(pageResponse.headers.get('set-cookie')).toBe('session=ok; Path=/')
  const navigation = makeNavigation(
    resolve,
    (() => {}) as never,
    new Set(),
    (() => {}) as never,
    1,
    { manifest, modules: {} },
  )
  const dataResponse = await navigation('/users/new', request, scope)
  expect(dataResponse.status).toBe(200)
  expect(dataResponse.headers.get('location')).toBeNull()
  expect(dataResponse.headers.get('x-route')).toBe('yes')
  expect(dataResponse.headers.get('set-cookie')).toBe('session=ok; Path=/')
  expect(await dataResponse.json()).toMatchObject({ r: '/users/alice', s: 302 })
  const explicit = await finalResolution('/users/new', {
    '/users/new': { load: () => redirect('/users/alice', 308) },
  })
  // oxlint-disable-next-line typescript/require-await -- the mocked contract returns a Promise
  const explicitPage = makePage({ resolve: async () => explicit } as never)
  const explicitResponse = await explicitPage(new URL(request.url), request, scope)
  expect(explicitResponse.status).toBe(308)
  expect(explicitResponse.headers.get('location')).toBe('/users/alice')
  expect(explicitResponse.headers.get('set-cookie')).toBe('session=ok; Path=/')
  const canonical = await finalResolution('/users/alice/?tab=posts')
  // oxlint-disable-next-line typescript/require-await -- the mocked contract returns a Promise
  const canonicalPage = makePage({ resolve: async () => canonical } as never)
  const canonicalResponse = await canonicalPage(new URL(request.url), request, scope)
  expect(canonicalResponse.status).toBe(307)
  expect(canonicalResponse.headers.get('location')).toBe('/users/alice?tab=posts')
})

it.each(['page', 'navigation'] as const)(
  'normalizes replacement %s body headers after merging scope headers',
  async (kind) => {
    const { makePage } = await import('../src/server/page')
    const { makeNavigation } = await import('../src/server/navigation')
    const { createScope } = await import('../src/exec')
    const native = new Headers([
      ['content-length', '0'],
      ['content-encoding', 'gzip'],
      ['content-type', 'application/pdf'],
      ['etag', '"old"'],
      ['digest', 'sha-256=old'],
      ['content-digest', 'sha-256=:old:'],
      ['content-md5', 'old'],
      ['content-range', 'bytes 0-0/1'],
      ['last-modified', 'Wed, 21 Oct 2015 07:28:00 GMT'],
      ['set-cookie', 'native-a=1; Path=/'],
      ['set-cookie', 'native-b=2; Path=/'],
      ['x-route', 'yes'],
      ['cache-control', 'private'],
    ])
    const result = await finalResolution('/users/new', {
      '/users/new': {
        load: () => {
          // oxlint-disable-next-line typescript/only-throw-error -- loaders throw weft's notFound()/redirect() results by design
          throw routerRedirect({ href: '/users/alice', statusCode: 302, headers: native })
        },
      },
    })
    const request = new Request('http://localhost/users/new')
    const scope = createScope(request)
    scope.headers.append('set-cookie', 'scope-a=3; Path=/')
    scope.headers.append('set-cookie', 'scope-b=4; Path=/')
    scope.headers.set('content-length', '0')
    scope.headers.set('content-encoding', 'br')
    scope.headers.set('content-type', 'text/plain')
    scope.headers.set('etag', '"scope"')
    scope.headers.set('location', '/scope-target')
    // oxlint-disable-next-line typescript/require-await -- the mocked contract returns a Promise
    const resolve = async () => result
    const response =
      kind === 'page'
        ? await makePage({ resolve } as never)(new URL(request.url), request, scope)
        : await makeNavigation(resolve, (() => {}) as never, new Set(), (() => {}) as never, 1, {
            manifest,
            modules: {},
          })('/users/new', request, scope)
    expect(response.status).toBe(kind === 'page' ? 302 : 200)
    expect.soft(response.headers.get('location')).toBe(kind === 'page' ? '/users/alice' : null)
    expect
      .soft(response.headers.get('content-type'))
      .toBe(kind === 'page' ? 'text/html; charset=utf-8' : 'application/json')
    for (const name of [
      'content-length',
      'content-encoding',
      'etag',
      'digest',
      'content-digest',
      'content-md5',
      'content-range',
      'last-modified',
    ])
      expect.soft(response.headers.get(name)).toBeNull()
    expect(response.headers.get('x-route')).toBe('yes')
    expect(response.headers.get('cache-control')).toBe(kind === 'page' ? 'private' : 'no-store')
    expect(response.headers.getSetCookie()).toEqual([
      'native-a=1; Path=/',
      'native-b=2; Path=/',
      'scope-a=3; Path=/',
      'scope-b=4; Path=/',
    ])
    expect((await response.text()).length).toBeGreaterThan(0)
  },
)
