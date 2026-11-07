import type * as ActualHelpers from '../src/run/helpers'
import { afterEach, expect, it, vi } from 'vitest'
import { flush, onCleanup } from '@weft-js/core'
import { insert, render } from '@weft-js/core/dom'
import { createRouteState, type RoutePayload } from '../src/router'
import type { ClientRoutes } from '../src/run'
import { retainRouteView } from '../src/run/retain-view'

import { Navigation } from '../src/run/navigation'
const requests = vi.hoisted(() => [] as { resolve: (response: Response) => void }[])
vi.mock('../src/run/boot', () => ({ streamed: {} }))
vi.mock('../src/run/helpers', async (load) => ({
  ...(await load<typeof ActualHelpers>()),
  ask: () =>
    new Promise<Response>((resolve) => {
      requests.push({ resolve })
    }),
}))

afterEach(() => {
  requests.length = 0
  document.body.innerHTML = ''
  vi.unstubAllGlobals()
})

function fixture(onDispose?: (id: string) => void, onSetup?: (id: string) => void) {
  history.replaceState(null, '', '/users/1')
  vi.stubGlobal('requestAnimationFrame', () => 0)
  const routes: ClientRoutes = {
    table: [
      { id: '/users/$id', pattern: '/users/$id', layouts: [] },
      { id: '/other', pattern: '/other', layouts: [] },
      { id: '/third', pattern: '/third', layouts: [] },
    ],
    load: {},
  }
  const route = createRouteState(
    { p: '/users/1', s: 200, m: [{ id: '/users/$id', params: { id: '1' }, data: { n: 1 } }] },
    {},
  )
  const release = vi.fn()
  route.prepareShape = () => ({
    kind: 'generated',
    ready: true,
    completeness: 'partial',
    component: () => null,
    release,
  })
  const cleanups: string[] = []
  const dispose = render(() => {
    const app = document.createElement('main')
    app.id = 'app'
    insert(
      app,
      retainRouteView(
        () => {
          const id = route.levels[0]!.id.value!
          onCleanup(() => {
            cleanups.push(id)
            onDispose?.(id)
          })
          onSetup?.(id)
          const button = document.createElement('button')
          button.dataset.route = id
          let count = 0
          button.addEventListener('click', () => {
            button.dataset.count = String(++count)
          })
          insert(
            button,
            () =>
              `${route.levels[0]!.params.value.id ?? id}:` +
              String((route.levels[0]!.data.value as { n: number }).n),
          )
          return button
        },
        () => (route.levels[0]!.shape.value ? 'pending' : undefined),
      ),
    )
    return app
  }, document.body)
  const page = {
    route,
    chunk: vi.fn(async () => {}),
    island: vi.fn(),
    setBag: vi.fn(),
    initialTags: [],
  }
  const nav = new Navigation(routes, page as unknown as ConstructorParameters<typeof Navigation>[1])
  return { nav, route, dispose, cleanups, release }
}

function answer(index: number, id: string, path: string, params: Record<string, string>) {
  const payload: RoutePayload = { p: path, s: 200, m: [{ id, params, data: { n: 2 } }] }
  requests[index]!.resolve(new Response(JSON.stringify(payload)))
}

it('commits a changed route and disposes the outgoing owner once', async () => {
  const f = fixture()
  const old = document.querySelector('button')!
  const pending = f.nav.go('/other', { scroll: false })
  expect(document.querySelector('main')!.textContent).toBe('pending')
  expect(f.cleanups).toEqual([])
  answer(0, '/other', '/other', {})
  await pending
  expect(document.querySelector('button')!.dataset.route).toBe('/other')
  expect(document.querySelector('button')).not.toBe(old)
  expect(f.cleanups).toEqual(['/users/$id'])
  expect(f.release).toHaveBeenCalledTimes(1)
  f.nav.dispose()
  f.dispose()
  expect(f.cleanups).toEqual(['/users/$id', '/other'])
})

it('commits same-ID params without rebuilding the owner', async () => {
  const f = fixture()
  const old = document.querySelector<HTMLButtonElement>('button')!
  old.click()
  const pending = f.nav.go('/users/2?tab=posts', { scroll: false })
  expect(document.querySelector('main')!.textContent).toBe('pending')
  expect(f.route.levels[0]!.params.value.id).toBe('1')
  answer(0, '/users/$id', '/users/2?tab=posts', { id: '2' })
  await pending
  expect(document.querySelector('button')).toBe(old)
  expect(old.dataset.count).toBe('1')
  expect(old.textContent).toBe('2:2')
  expect(f.cleanups).toEqual([])
  expect(f.release).toHaveBeenCalledTimes(1)
  f.nav.dispose()
  f.dispose()
  expect(f.cleanups).toEqual(['/users/$id'])
})

it('ignores a replaced response and restores the exact nodes on cancellation', async () => {
  const f = fixture()
  const old = document.querySelector<HTMLButtonElement>('button')!
  old.click()
  const first = f.nav.go('/other', { scroll: false })
  const second = f.nav.go('/users/2', { scroll: false })
  expect(document.querySelector('main')!.textContent).toBe('pending')
  answer(0, '/other', '/other', {})
  await first
  expect(document.querySelector('main')!.textContent).toBe('pending')
  f.nav.current!.abort()
  answer(1, '/users/$id', '/users/2', { id: '2' })
  await second
  flush()
  expect(document.querySelector('button')).toBe(old)
  expect(old.dataset.count).toBe('1')
  expect(f.route.levels[0]!.params.value.id).toBe('1')
  expect(f.cleanups).toEqual([])
  expect(f.release).toHaveBeenCalledTimes(2)
  f.nav.dispose()
  f.dispose()
  expect(f.cleanups).toEqual(['/users/$id'])
})

it('keeps a reentrant navigation from cleanup during a real commit', async () => {
  let nested: Promise<void> | undefined
  const f = fixture((id) => {
    if (id === '/users/$id') nested = f.nav.go('/third', { scroll: false })
  })
  const first = f.nav.go('/other', { scroll: false })
  answer(0, '/other', '/other', {})
  await first
  expect(nested).toBeDefined()
  expect(f.nav.committedURL).toBe('http://localhost/other')
  expect(location.pathname).toBe('/third')
  answer(1, '/third', '/third', {})
  await nested
  expect(document.querySelector('button')!.dataset.route).toBe('/third')
  expect(f.nav.committedURL).toBe('http://localhost/third')
  expect(f.cleanups.filter((id) => id === '/users/$id')).toHaveLength(1)
  f.nav.dispose()
  f.dispose()
})

it('keeps a reentrant navigation from setup during a real commit', async () => {
  let nested: Promise<void> | undefined
  const f = fixture(undefined, (id) => {
    if (id === '/other') nested = f.nav.go('/third', { scroll: false })
  })
  const first = f.nav.go('/other', { scroll: false })
  answer(0, '/other', '/other', {})
  await first
  expect(nested).toBeDefined()
  expect(f.nav.committedURL).toBe('http://localhost/other')
  expect(location.pathname).toBe('/third')
  answer(1, '/third', '/third', {})
  await nested
  expect(document.querySelector('button')!.dataset.route).toBe('/third')
  expect(f.nav.committedURL).toBe('http://localhost/third')
  f.nav.dispose()
  f.dispose()
})
