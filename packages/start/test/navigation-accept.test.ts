import type * as ActualHelpers from '../src/run/helpers'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClientRoutes } from '../src/run'

import { Navigation } from '../src/run/navigation'
import { ask, current_, guess } from '../src/run/helpers'
import { applyMatches } from '../src/router'
import { flush } from '@weft-js/core'
vi.mock('@weft-js/core', () => ({ flush: vi.fn() }))
vi.mock('@weft-js/core/head', () => ({ setHead: vi.fn() }))
vi.mock('../src/router', () => ({
  client: {},
  applyMatches: vi.fn(),
  level: (route: { levels: unknown[] }, depth: number) => route.levels[depth],
}))
vi.mock('../src/run/boot', () => ({ streamed: {} }))
vi.mock('../src/run/helpers', async (load) => ({
  ...(await load<typeof ActualHelpers>()),
  ask: vi.fn(
    (_url: URL, signal?: AbortSignal) =>
      new Promise((_resolve, reject) => {
        signal?.addEventListener('abort', () => reject(new Error('aborted')), { once: true })
      }),
  ),
  current_: vi.fn(),
  guess: vi.fn((): string[] => []),
  revive: (value: unknown) => value,
}))

beforeEach(() => {
  history.replaceState(null, '', '/from')
  vi.stubGlobal('requestAnimationFrame', () => 0)
})
afterEach(() => {
  document.body.innerHTML = ''
})

describe('navigation acceptance', () => {
  it('sets history and accepted path synchronously without changing committed levels', async () => {
    const routes: ClientRoutes = { table: [], load: {} }
    const level = {
      id: { value: 'old' },
      params: { value: { id: '1' } },
      shape: { value: undefined },
    }
    const prepareShape = () => ({
      kind: 'generated',
      ready: true,
      completeness: 'partial',
      component: () => null,
      release: () => {},
    })
    const page = {
      route: { path: { value: '/from' }, levels: [level], prepareShape },
      chunk: vi.fn(async () => {}),
      island: vi.fn(),
      setBag: vi.fn(),
      initialTags: [],
    }
    vi.mocked(guess).mockReturnValue(['/next'])
    const nav = new Navigation(
      routes,
      page as unknown as ConstructorParameters<typeof Navigation>[1],
    )
    const pending = nav.go('/next?x=1')
    expect(location.pathname + location.search).toBe('/next?x=1')
    expect(page.route.path.value).toBe('/next?x=1')
    expect(level.id.value).toBe('old')
    expect(level.params.value).toEqual({ id: '1' })
    expect(current_).toHaveBeenCalledWith('/next')
    nav.current?.abort()
    await pending
    expect(nav.source).toBeUndefined()
    expect(location.pathname).toBe('/from')
    vi.mocked(guess).mockReturnValue([])
  })

  it('replaces a prepared outlet and releases leases on replacement and cancel', async () => {
    const routes: ClientRoutes = { table: [], load: {} }
    const old = { id: { value: 'old' }, shape: { value: undefined } }
    const released: string[] = []
    const prepareShape = (id: string) => ({
      kind: 'generated',
      ready: true,
      completeness: 'partial',
      component: () => null,
      release: () => released.push(id),
    })
    const page = {
      route: { path: { value: '/from' }, levels: [old], prepareShape },
      chunk: vi.fn(async () => {}),
      island: vi.fn(),
      setBag: vi.fn(),
      initialTags: [],
    }
    vi.mocked(guess).mockImplementation((_routes, path) => [path])
    const nav = new Navigation(
      routes,
      page as unknown as ConstructorParameters<typeof Navigation>[1],
    )
    const first = nav.go('/next')
    expect(old.shape.value).toHaveLength(1)
    const second = nav.go('/other')
    await first
    expect(released).toEqual(['/next'])
    expect(old.shape.value).toHaveLength(1)
    nav.current?.abort()
    await second
    expect(released).toEqual(['/next', '/other'])
    expect(old.shape.value).toBeUndefined()
    expect(nav.source).toBeUndefined()
    vi.mocked(guess).mockReturnValue([])
  })

  it('keeps the current outlet when a shape is disabled or unavailable', async () => {
    const routes: ClientRoutes = { table: [], load: {} }
    const old = { id: { value: 'old' }, shape: { value: undefined } }
    const release = vi.fn()
    const prepareShape = (id: string) =>
      id === '/layout'
        ? {
            kind: 'generated',
            ready: true,
            completeness: 'partial',
            component: () => null,
            release,
          }
        : null
    const page = {
      route: { path: { value: '/from' }, levels: [old], prepareShape },
      chunk: vi.fn(async () => {}),
      island: vi.fn(),
      setBag: vi.fn(),
      initialTags: [],
    }
    vi.mocked(guess).mockReturnValue(['/layout', '/disabled'])
    const nav = new Navigation(
      routes,
      page as unknown as ConstructorParameters<typeof Navigation>[1],
    )
    const pending = nav.go('/next')
    expect(old.shape.value).toBeUndefined()
    expect(location.pathname).toBe('/next')
    expect(page.route.path.value).toBe('/next')
    expect(release).toHaveBeenCalledOnce()
    nav.current?.abort()
    await pending
    expect(nav.source).toBeUndefined()
    vi.mocked(guess).mockReturnValue([])
  })

  it('does not clear an existing presentation for an unavailable replacement', async () => {
    const routes: ClientRoutes = { table: [], load: {} }
    const outlet = { id: { value: 'old' }, shape: { value: undefined } }
    const release = vi.fn()
    const prepareShape = (id: string) =>
      id === '/next'
        ? {
            kind: 'generated',
            ready: true,
            completeness: 'partial',
            component: () => null,
            release,
          }
        : null
    const page = {
      route: { path: { value: '/from' }, levels: [outlet], prepareShape },
      chunk: vi.fn(async () => {}),
      island: vi.fn(),
      setBag: vi.fn(),
      initialTags: [],
    }
    vi.mocked(guess).mockImplementation((_routes, path) => [path])
    const nav = new Navigation(
      routes,
      page as unknown as ConstructorParameters<typeof Navigation>[1],
    )
    const first = nav.go('/next')
    const shown = outlet.shape.value
    const second = nav.go('/unavailable')
    await first
    expect(outlet.shape.value).toBe(shown)
    expect(release).not.toHaveBeenCalled()
    nav.current?.abort()
    await second
    expect(release).toHaveBeenCalledOnce()
    expect(nav.source).toBeUndefined()
    vi.mocked(guess).mockReturnValue([])
  })

  it('accepts without a shape while retained controls use their source URL', async () => {
    history.replaceState(null, '', '/dir/from')
    document.body.innerHTML = '<a href="child">go</a><form></form>'
    const routes: ClientRoutes = { table: [], load: {} }
    const old = { id: { value: 'old' }, shape: { value: undefined } }
    const page = {
      route: { path: { value: '/dir/from' }, levels: [old], prepareShape: () => null },
      chunk: vi.fn(async () => {}),
      island: vi.fn(),
      setBag: vi.fn(),
      initialTags: [],
    }
    vi.mocked(guess).mockReturnValue(['/next'])
    const nav = new Navigation(
      routes,
      page as unknown as ConstructorParameters<typeof Navigation>[1],
    )
    const pending = nav.go('/elsewhere/next')
    expect(location.pathname).toBe('/elsewhere/next')
    expect(page.route.path.value).toBe('/elsewhere/next')
    expect(document.querySelector('a')!.href).toBe('http://localhost/dir/child')
    expect(document.querySelector('form')!.action).toBe('http://localhost/dir/from')
    nav.current?.abort()
    await pending
    expect(nav.source).toBeUndefined()
    document.body.innerHTML = ''
    vi.mocked(guess).mockReturnValue([])
  })

  it('keeps shared layout state and releases the shape after real content commits', async () => {
    history.replaceState(null, '', '/dir/from')
    document.body.innerHTML = '<div id="app"><a href="child">outgoing</a></div>'
    const routes: ClientRoutes = { table: [], load: {} }
    const layout = { id: { value: 'layout' }, shape: { value: undefined } }
    const old = { id: { value: 'old' }, shape: { value: undefined } }
    const release = vi.fn()
    const prepareShape = vi.fn(() => ({
      kind: 'override',
      ready: true,
      completeness: 'partial',
      component: () => null,
      release,
    }))
    const page = {
      route: { path: { value: '/from' }, levels: [layout, old], prepareShape },
      chunk: vi.fn(async () => {}),
      island: vi.fn(),
      setBag: vi.fn(),
      initialTags: [],
    }
    vi.mocked(guess).mockReturnValue(['layout', '/next'])
    vi.mocked(ask).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          m: [
            { id: 'layout', params: {} },
            { id: '/next', params: {} },
          ],
          p: '/next',
          s: 200,
        }),
      ),
    )
    let incoming = ''
    let retained = ''
    let submitted = ''
    const submit = vi.spyOn(HTMLFormElement.prototype, 'submit').mockImplementation(function (
      this: HTMLFormElement,
    ) {
      submitted = this.action
    })
    vi.mocked(applyMatches).mockImplementationOnce(() => {
      retained = document.querySelector('a')!.href
      const image = document.createElement('img')
      image.src = 'photo.png'
      incoming = image.src
      const form = document.createElement('form')
      document.querySelector('#app')!.append(form)
      expect(form.getAttribute('action')).toBeNull()
      form.submit()
    })
    const nav = new Navigation(
      routes,
      page as unknown as ConstructorParameters<typeof Navigation>[1],
    )
    const pending = nav.go('/elsewhere/next', { scroll: false })
    expect(layout.shape.value).toBeUndefined()
    expect(layout.id.value).toBe('layout')
    expect(prepareShape).toHaveBeenCalledExactlyOnceWith('/next')
    expect(old.shape.value).toHaveLength(1)
    await pending
    expect(retained).toBe('http://localhost/dir/child')
    expect(incoming).toBe('http://localhost/elsewhere/photo.png')
    expect(submitted).toBe('http://localhost/elsewhere/next')
    expect(document.querySelector('a')!.getAttribute('href')).toBe('child')
    expect(nav.source).toBeUndefined()
    expect(release).toHaveBeenCalledOnce()
    expect(old.shape.value).toBeUndefined()
    submit.mockRestore()
    vi.mocked(guess).mockReturnValue([])
  })

  it('tears down pending control ownership and form wrappers', async () => {
    document.body.innerHTML = '<div id="app"><a href="child">old</a></div>'
    const routes: ClientRoutes = { table: [], load: {} }
    const old = { id: { value: 'old' }, shape: { value: undefined } }
    const page = {
      route: { path: { value: '/from' }, levels: [old], prepareShape: () => null },
      chunk: vi.fn(async () => {}),
      island: vi.fn(),
      setBag: vi.fn(),
      initialTags: [],
    }
    vi.mocked(guess).mockReturnValue(['/next'])
    // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
    const original = HTMLFormElement.prototype.submit
    const nav = new Navigation(
      routes,
      page as unknown as ConstructorParameters<typeof Navigation>[1],
    )
    const pending = nav.go('/next')
    // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
    expect(HTMLFormElement.prototype.submit).not.toBe(original)
    nav.dispose()
    await pending
    expect(nav.source).toBeUndefined()
    // oxlint-disable-next-line typescript/unbound-method -- the native method is kept to be called with .call()
    expect(HTMLFormElement.prototype.submit).toBe(original)
    expect(document.querySelector('a')!.getAttribute('href')).toBe('child')
    vi.mocked(guess).mockReturnValue([])
  })

  it('uses the newly committed URL when incoming setup reenters navigation', async () => {
    history.replaceState(null, '', '/dir/from')
    document.body.innerHTML = '<div id="app"></div>'
    const routes: ClientRoutes = { table: [], load: {} }
    const old = { id: { value: 'old' }, shape: { value: undefined } }
    const page = {
      route: { path: { value: '/dir/from' }, levels: [old], prepareShape: () => null },
      chunk: vi.fn(async () => {}),
      island: vi.fn(),
      setBag: vi.fn(),
      initialTags: [],
    }
    vi.mocked(guess).mockReturnValue([])
    vi.mocked(ask).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          m: [{ id: '/first', params: {} }],
          p: '/first',
          s: 200,
        }),
      ),
    )
    const nav = new Navigation(
      routes,
      page as unknown as ConstructorParameters<typeof Navigation>[1],
    )
    let nested: Promise<void> | undefined
    vi.mocked(applyMatches).mockImplementationOnce(() => {
      vi.mocked(flush).mockImplementationOnce(() => {
        nested = nav.go('/second', { scroll: false })
      })
    })
    await nav.go('/first', { scroll: false })
    expect(nav.current?.signal.aborted).toBe(false)
    expect(page.route.path.value).toBe('/second')
    expect(nav.committedURL).toBe('http://localhost/first')
    const form = document.createElement('form')
    document.querySelector('#app')!.append(form)
    await Promise.resolve()
    expect(form.action).toBe('http://localhost/first')
    nav.current?.abort()
    await nested
  })

  it('presents changed params and queries at their first affected outlet', async () => {
    history.replaceState(null, '', '/users/1/posts/one?q=1')
    const routes: ClientRoutes = {
      table: [
        {
          id: '/users/$id/posts/$post',
          pattern: '/users/$id/posts/$post',
          layouts: ['layout:', 'layout:users/[id]'],
        },
      ],
      load: {},
    }
    const levels = ['layout:', 'layout:users/[id]', '/users/$id/posts/$post'].map((id) => ({
      id: { value: id },
      params: { value: { id: '1', post: 'one' } },
      shape: { value: undefined },
    }))
    const release = vi.fn()
    const prepareShape = vi.fn(() => ({
      kind: 'generated',
      ready: true,
      completeness: 'partial',
      component: () => null,
      release,
    }))
    const page = {
      route: { path: { value: location.pathname + location.search }, levels, prepareShape },
      chunk: vi.fn(async () => {}),
      island: vi.fn(),
      setBag: vi.fn(),
      initialTags: [],
    }
    const real = await vi.importActual<typeof ActualHelpers>('../src/run/helpers')
    vi.mocked(guess).mockImplementation(real.guess)
    const nav = new Navigation(
      routes,
      page as unknown as ConstructorParameters<typeof Navigation>[1],
    )
    const first = nav.go('/users/2/posts/one?q=1')
    expect(levels[0]!.shape.value).toBeUndefined()
    expect(levels[1]!.shape.value).toBeUndefined()
    expect(levels[2]!.shape.value).toHaveLength(1)
    expect(levels[1]!.params.value.id).toBe('1')
    const second = nav.go('/users/1/posts/two?q=1')
    await first
    expect(levels[1]!.shape.value).toBeUndefined()
    expect(levels[2]!.shape.value).toHaveLength(1)
    const third = nav.go('/users/1/posts/one?q=2')
    await second
    expect(levels[2]!.shape.value).toHaveLength(1)
    expect(release).toHaveBeenCalledTimes(3)
    const back = nav.go('/users/1/posts/one?q=1#section')
    await third
    expect(levels[2]!.shape.value).toBeUndefined()
    expect(release).toHaveBeenCalledTimes(4)
    nav.current?.abort()
    await back
    vi.mocked(guess).mockReturnValue([])
  })

  it('does not present a same-path or hash change and honors a disabled leaf', async () => {
    history.replaceState(null, '', '/users/1?q=1')
    const routes: ClientRoutes = {
      table: [{ id: '/users/$id', pattern: '/users/$id', layouts: ['layout:'] }],
      load: {},
    }
    const levels = ['layout:', '/users/$id'].map((id) => ({
      id: { value: id },
      shape: { value: undefined },
    }))
    const prepareShape = vi.fn(() => null)
    const page = {
      route: { path: { value: '/users/1?q=1' }, levels, prepareShape },
      chunk: vi.fn(async () => {}),
      island: vi.fn(),
      setBag: vi.fn(),
      initialTags: [],
    }
    vi.mocked(guess).mockReturnValue(levels.map((item) => item.id.value))
    const nav = new Navigation(
      routes,
      page as unknown as ConstructorParameters<typeof Navigation>[1],
    )
    await nav.go('/users/1?q=1')
    expect(prepareShape).not.toHaveBeenCalled()
    const hash = nav.go('/users/1?q=1#part')
    expect(prepareShape).not.toHaveBeenCalled()
    const next = nav.go('/users/2?q=1')
    await hash
    expect(prepareShape).toHaveBeenCalledOnce()
    expect(levels[1]!.shape.value).toBeUndefined()
    nav.current?.abort()
    await next
    vi.mocked(guess).mockReturnValue([])
  })
})
