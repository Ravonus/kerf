// weft/browser (PLAN §4.2, research 07 §6): values that subscribe on first read, share one listener per
// (target, type), go with their owner, and have a defined server value. Plus weft/test's page fakes and T012.
import { screen } from '@testing-library/dom'
import { createRoot, defineState, derived, devComponent } from 'weft'
import { interval, lifecycle, media, on, online, visible } from 'weft/browser'
import { hydrate } from 'weft/dom'
import { renderToString } from 'weft/ssr'
import { assertNoLeaks, flush, leaks, net, page, render } from 'weft/test'
// @ts-expect-error: query imports (vite.mjs)
import { Status as ServerStatus } from './fixtures/browser/Status.tsx?weft-ssr'
// @ts-expect-error
import { Status as ClientStatus } from './fixtures/browser/Status.tsx?weft-hydrate'

/** Count native listeners added and removed for `type` on window and document while `fn` runs. */
function listeners(type: string) {
  const add = [vi.spyOn(window, 'addEventListener'), vi.spyOn(document, 'addEventListener')]
  const remove = [vi.spyOn(window, 'removeEventListener'), vi.spyOn(document, 'removeEventListener')]
  const count = (spies: typeof add) => spies.flatMap(s => s.mock.calls).filter(c => c[0] === type).length
  return { get added() { return count(add) }, get removed() { return count(remove) } }
}

afterEach(() => vi.restoreAllMocks())

describe('online', () => {
  function Status() {
    const isOnline = online()
    return <p>{isOnline.value ? 'online' : 'offline'}</p>
  }

  it('follows the network', async () => {
    render(Status)
    expect(screen.getByText('online')).toBeTruthy()
    await net.offline()
    expect(screen.getByText('offline')).toBeTruthy()
    await net.online()
    expect(screen.getByText('online')).toBeTruthy()
  })

  it('fifty readers share one listener per event, removed with the last one', async () => {
    const l = listeners('offline')
    function Many() {
      return <ul>{Array.from({ length: 50 }, (_, i) => <li key={i}><Status /></li>)}</ul>
    }
    const { unmount } = render(Many)
    expect(l.added).toBe(1)
    await net.offline()
    expect(screen.getAllByText('offline')).toHaveLength(50)
    unmount()
    expect(l.removed).toBe(1)
    expect(leaks()).toEqual([])
  })

  it('subscribes on first read, not on creation', () => {
    const l = listeners('online')
    function Unread() {
      online()
      return <p>x</p>
    }
    render(Unread)
    expect(l.added).toBe(0)
    expect(leaks()).toEqual([])
  })

  it('reads the current value when it subscribes again', async () => {
    const first = render(Status)
    first.unmount()
    await net.offline() // nothing listening
    render(Status)
    expect(screen.getByText('offline')).toBeTruthy()
  })
})

it('visible follows visibilitychange', async () => {
  function Tab() {
    const v = visible()
    return <p>{v.value ? 'shown' : 'hidden'}</p>
  }
  render(Tab)
  expect(screen.getByText('shown')).toBeTruthy()
  await page.hide()
  expect(screen.getByText('hidden')).toBeTruthy()
  await page.show()
  expect(screen.getByText('shown')).toBeTruthy()
})

it('lifecycle: active, passive, hidden, frozen, terminated', async () => {
  function Life() {
    const p = lifecycle()
    return <p data-testid="p">{p.value}</p>
  }
  render(Life)
  const text = () => screen.getByTestId('p').textContent
  expect(text()).toBe('active')
  await page.blur()
  expect(text()).toBe('passive')
  await page.focus()
  await page.hide()
  expect(text()).toBe('hidden')
  await page.freeze()
  expect(text()).toBe('frozen')
  await page.resume()
  expect(text()).toBe('hidden')
  await page.leave({ persisted: true })
  expect(text()).toBe('frozen')
  await page.restore()
  expect(text()).toBe('active')
  await page.leave()
  expect(text()).toBe('terminated')
})

it('media follows its query; queries are independent', async () => {
  function Theme() {
    const dark = media('(prefers-color-scheme: dark)', { ssr: false })
    const wide = media('(min-width: 800px)', { ssr: false })
    return <p data-testid="t">{dark.value ? 'dark' : 'light'} {wide.value ? 'wide' : 'narrow'}</p>
  }
  render(Theme)
  const text = () => screen.getByTestId('t').textContent
  expect(text()).toBe('light narrow')
  await page.media('(prefers-color-scheme: dark)', true)
  expect(text()).toBe('dark narrow')
  await page.media('(min-width: 800px)', true)
  expect(text()).toBe('dark wide')
})

it('works from derived and inside a defineState setup (which doesn\'t collect its boxes)', async () => {
  const net$ = defineState('net', () => {
    const isOnline = online()
    const label = derived(() => (isOnline.value ? 'up' : 'down'))
    return { label }
  })
  function Badge() {
    return <p>{net$.label.value}</p>
  }
  render(Badge)
  expect(screen.getByText('up')).toBeTruthy()
  await net.offline()
  expect(screen.getByText('down')).toBeTruthy()
})

describe('on', () => {
  it('listens until the owner goes; the event is typed from the target', async () => {
    const keys: string[] = []
    function Keys() {
      on(window, 'keydown', e => keys.push(e.key))
      return <p>k</p>
    }
    const { unmount } = render(Keys)
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }))
    unmount()
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'b' }))
    expect(keys).toEqual(['a'])
  })

  it('shares one native listener per (target, type); options get their own', () => {
    const l = listeners('resize')
    const seen: number[] = []
    const dispose = createRoot(d => {
      on(window, 'resize', () => seen.push(1))
      on(window, 'resize', () => seen.push(2))
      on(window, 'resize', () => seen.push(3), { passive: true })
      return d
    })
    expect(l.added).toBe(2)
    window.dispatchEvent(new Event('resize'))
    expect(seen.sort()).toEqual([1, 2, 3])
    dispose()
    expect(l.removed).toBe(2)
  })

  it('returns a stop function', () => {
    const seen: string[] = []
    const dispose = createRoot(d => {
      const stop = on(document, 'click', () => seen.push('c'))
      document.dispatchEvent(new Event('click'))
      stop()
      document.dispatchEvent(new Event('click'))
      return d
    })
    dispose()
    expect(seen).toEqual(['c'])
  })
})

describe('interval', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('ticks until the owner goes', () => {
    let n = 0
    function Tick() {
      interval('1s', () => n++)
      return <p>t</p>
    }
    const { unmount } = render(Tick)
    vi.advanceTimersByTime(3500)
    expect(n).toBe(3)
    unmount()
    vi.advanceTimersByTime(5000)
    expect(n).toBe(3)
  })

  it.each([[250, 250], ['500ms', 500], ['2s', 2000], ['1.5s', 1500], ['1m', 60000], ['1h', 3600000]] as const)('%s is %i ms', (every, ms) => {
    let n = 0
    const dispose = createRoot(d => (interval(every as any, () => n++), d))
    vi.advanceTimersByTime(ms - 1)
    expect(n).toBe(0)
    vi.advanceTimersByTime(1)
    expect(n).toBe(1)
    dispose()
  })

  it('rejects what isn\'t a duration', () => {
    expect(() => createRoot(() => interval('soon' as any, () => {}))).toThrow(/isn't a duration/)
  })
})

describe('W051 at runtime: outside an owner', () => {
  it.each([
    ['online', () => online()],
    ['media', () => media('(x)', { ssr: false })],
    ['on', () => on(window, 'scroll', () => {})],
    ['interval', () => interval(10, () => {})],
  ])('%s throws in dev', (_, make) => {
    expect(make).toThrow(/^W051: .* was created outside an owner/)
    expect(leaks()).toEqual([])
  })

  it('an explicit createRoot is an owner', () => {
    const dispose = createRoot(d => (online().value, d))
    expect(leaks()).toEqual(['online()'])
    dispose()
    expect(leaks()).toEqual([])
  })
})

describe('server and hydration', () => {
  afterEach(() => { document.body.innerHTML = '' })

  it('renders the declared values on the server and touches no browser API', () => {
    const match = vi.spyOn(window, 'matchMedia')
    const l = listeners('keydown')
    const html = renderToString(() => ServerStatus({}))
    expect(Object.assign(document.createElement('div'), { innerHTML: html }).textContent).toBe('online light')
    expect(match).not.toHaveBeenCalled()
    expect(l.added).toBe(0)
    expect(leaks()).toEqual([])
  })

  it('media without ssr warns (W054) and renders false on the server', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const html = renderToString(() => { const d = media('(prefers-color-scheme: dark)'); return String(d.value) })
    expect(html).toBe('false')
    expect(warn.mock.calls[0][0]).toMatch(/^W054: media\('\(prefers-color-scheme: dark\)'\) is read on the server without `ssr`/)
  })

  it('hydrates with the server value, then switches to the real one in the next flush', async () => {
    await page.media('(prefers-color-scheme: dark)', true)
    await net.offline()
    const container = document.body.appendChild(document.createElement('div'))
    container.innerHTML = renderToString(() => ServerStatus({}))
    const dispose = hydrate(() => ClientStatus({}), container)
    expect(container.textContent).toBe('online light')
    await flush()
    expect(container.textContent).toBe('offline dark')
    dispose()
    expect(leaks()).toEqual([])
  })
})

describe('T012: the leak check', () => {
  it('names what a test left open, and closes it', () => {
    const l = listeners('keydown')
    createRoot(() => {
      on(window, 'keydown', () => {})
      interval('1s', () => {})
      online().value
    }) // never disposed
    expect(leaks()).toEqual(['`keydown` listener', "interval('1s')", 'online()'])
    expect(() => assertNoLeaks()).toThrow(/^T012: the test ended with 3 open subscriptions, listeners or intervals:\n {2}- `keydown` listener\n {2}- interval\('1s'\)\n {2}- online\(\)\n {2}fix: unmount/)
    expect(leaks()).toEqual([])
    expect(l.removed).toBe(1)
  })

  it('names the component it was made in (dev names)', () => {
    devComponent.label = '<Leaky> (Leaky.tsx:3:5)'
    try {
      createRoot(() => { on(window, 'keydown', () => {}); online().value })
    } finally { devComponent.label = undefined }
    expect(leaks()).toEqual(['`keydown` listener in <Leaky> (Leaky.tsx:3:5)', 'online() in <Leaky> (Leaky.tsx:3:5)'])
    expect(() => assertNoLeaks()).toThrow(/T012/)
  })

  it('passes once everything is unmounted', () => {
    const { unmount } = render(() => (on(window, 'keydown', () => {}), <p>ok</p>))
    unmount()
    expect(() => assertNoLeaks()).not.toThrow()
  })
})
