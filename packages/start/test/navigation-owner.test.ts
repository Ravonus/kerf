import { afterEach, expect, it, vi } from 'vitest'
import { flush, onCleanup } from '@weft-js/core'
import { insert, render } from '@weft-js/core/dom'
import { createRouteState } from '../src/router'
import type { ClientRoutes } from '../src/run'

vi.mock('../src/run/boot', () => ({ streamed: {} }))
vi.mock('../src/run/helpers', async (load) => ({
  ...await load<typeof import('../src/run/helpers')>(),
  ask: (_url: URL, signal?: AbortSignal) => new Promise((_resolve, reject) => {
    signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
  }),
}))
import { Navigation } from '../src/run/navigation'

afterEach(() => { document.body.innerHTML = '' })

it('keeps mounted layout and page owners through replacements and cancellation', async () => {
  history.replaceState(null, '', '/users/1?q=1')
  vi.stubGlobal('requestAnimationFrame', () => 0)
  const routes: ClientRoutes = { table: [{ id: '/users/$id', pattern: '/users/$id',
    layouts: ['layout:', 'layout:users/[id]'] }, { id: '/other', pattern: '/other',
    layouts: ['layout:', 'layout:users/[id]'] }], load: {} }
  const route = createRouteState({ p: '/users/1?q=1', s: 200, m: [
    { id: 'layout:', params: {} }, { id: 'layout:users/[id]', params: { id: '1' } },
    { id: '/users/$id', params: { id: '1' } },
  ] }, {})
  const release = vi.fn()
  route.prepareShape = () => ({ kind: 'generated', ready: true, completeness: 'partial',
    component: () => null, release })
  let mounts = 0, cleanups = 0, pageMounts = 0, pageCleanups = 0
  const dispose = render(() => {
    const app = document.createElement('main')
    app.id = 'app'
    insert(app, () => {
      if (route.levels[1]!.shape.value) return 'layout shape'
      mounts++
      onCleanup(() => { cleanups++ })
      const layout = document.createElement('section')
      const button = document.createElement('button')
      let count = 0
      button.textContent = '0'
      button.addEventListener('click', () => { button.textContent = String(++count) })
      layout.append(button)
      const outlet = document.createElement('div')
      layout.append(outlet)
      insert(outlet, () => {
        if (route.levels[2]!.shape.value) return 'page shape'
        pageMounts++
        onCleanup(() => { pageCleanups++ })
        const pageButton = document.createElement('button')
        let pageCount = 0
        pageButton.textContent = 'page 0'
        pageButton.addEventListener('click', () => {
          pageButton.textContent = `page ${++pageCount}`
        })
        return pageButton
      })
      return layout
    })
    return app
  }, document.body)
  const page = { route, chunk: vi.fn(async () => {}), island: vi.fn(), setBag: vi.fn(),
    initialTags: [] }
  const nav = new Navigation(routes, page as unknown as ConstructorParameters<typeof Navigation>[1])
  const button = document.querySelector('button')!
  button.click()
  const pageButton = document.querySelector<HTMLButtonElement>('section div button')!
  pageButton.click()
  try {
    const first = nav.go('/users/2?q=1')
    expect(document.querySelector('button')).toBe(button)
    expect(button.textContent).toBe('1')
    expect(document.querySelector('section div button')).toBe(pageButton)
    expect(pageCleanups).toBe(0)
    expect(pageButton.textContent).toBe('page 1')
    const next = nav.go('/users/1?q=2')
    await first
    expect(document.querySelector('button')).toBe(button)
    pageButton.click()
    expect(pageButton.textContent).toBe('page 2')
    button.click()
    expect(button.textContent).toBe('2')
    nav.current?.abort()
    await next
    flush()
    expect(document.querySelector('button')).toBe(button)
    expect(document.querySelector('section div button')).toBe(pageButton)
    expect([mounts, cleanups, pageMounts, pageCleanups]).toEqual([1, 0, 1, 0])
    const changed = nav.go('/other')
    expect(document.querySelector('section div')!.textContent).toBe('page shape')
    expect(pageCleanups).toBe(1)
    nav.current?.abort()
    await changed
  } finally {
    nav.dispose()
    dispose()
    vi.unstubAllGlobals()
  }
  expect(cleanups).toBe(1)
  expect(pageCleanups).toBe(2)
})

it('compares decoded splat segments and rejects malformed route guesses', async () => {
  history.replaceState(null, '', '/files/a%2Fb')
  const routes: ClientRoutes = { table: [{ id: '/files/$', pattern: '/files/$',
    layouts: ['layout:'] }], load: {} }
  const route = createRouteState({ p: '/files/a%2Fb', s: 200, m: [
    { id: 'layout:', params: {} }, { id: '/files/$', params: { rest: 'a/b' } },
  ] }, {})
  const page = { route, chunk: vi.fn(async () => {}), island: vi.fn(), setBag: vi.fn(),
    initialTags: [] }
  vi.stubGlobal('requestAnimationFrame', () => 0)
  try {
    const nav = new Navigation(routes, page as unknown as ConstructorParameters<typeof Navigation>[1])
    const { guess } = await import('../src/run/helpers')
    const ids = guess(routes, '/files/a/b')
    expect(ids).toEqual(['layout:', '/files/$'])
    expect(nav.changedParams(ids, new URL('/files/a/b', location.href))).toBe(1)
    expect(nav.changedParams(ids, new URL('/files/a%2fb', location.href))).toBe(-1)
    expect(guess(routes, '/files/%XX')).toEqual([])
    expect(nav.changedParams(ids, new URL('/files/%XX', location.href))).toBe(-1)
  } finally { vi.unstubAllGlobals() }
})
