import { afterEach, expect, it, vi } from 'vitest'
import type { ClientRoutes } from '../src/run'
import type { Navigation } from '../src/run/navigation'
import { preload } from '../src/run/listeners'

const routes: ClientRoutes = { table: [{ id: '/to', pattern: '/to', layouts: [] }], load: {} }
const network = Object.assign(new EventTarget(), { effectiveType: '4g', saveData: false })
let stop: (() => void) | undefined
function setup() {
  vi.useFakeTimers()
  vi.stubGlobal('navigator', { connection: network, onLine: true })
  const prefetch = { start: vi.fn(), cancel: vi.fn() }
  const nav = { routes, prefetch, cache: { version: 0, setBuild: vi.fn() } }
  stop = preload(nav as unknown as Navigation)
  return prefetch
}
function link(href: string, attrs: Record<string, string> = {}) {
  const anchor = document.createElement('a')
  anchor.href = href
  for (const [name, value] of Object.entries(attrs)) anchor.setAttribute(name, value)
  document.body.append(anchor)
  return anchor
}
function hover(anchor: Element, options: MouseEventInit = {}) {
  anchor.dispatchEvent(new MouseEvent('pointerover', { bubbles: true, ...options }))
  vi.advanceTimersByTime(81)
}
afterEach(() => {
  stop?.(); stop = undefined
  document.body.innerHTML = ''
  vi.useRealTimers(); vi.unstubAllGlobals()
  network.saveData = false
  network.effectiveType = '4g'
  history.replaceState(null, '', '/from')
})

it('uses navigation admission for native and opted-out links on hover and focus', () => {
  history.replaceState(null, '', '/from')
  const prefetch = setup()
  for (const [href, attrs] of [
    ['/to', { target: '_blank' }], ['/to', { download: '' }],
    ['/to', { rel: 'external' }], ['/to', { 'data-navigation': 'off' }],
    ['/to', { 'data-preload': 'off' }], ['https://example.org/to', {}],
    ['/from#section', {}], ['/from', {}], ['mailto:test@example.org', {}], ['/unknown', {}],
  ] as [string, Record<string, string>][]) {
    const anchor = link(href, attrs)
    hover(anchor)
    anchor.dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
    vi.runOnlyPendingTimers()
  }
  hover(link('/to'), { ctrlKey: true })
  expect(prefetch.start).not.toHaveBeenCalled()
  hover(link('/to'))
  link('/to').dispatchEvent(new FocusEvent('focusin', { bubbles: true }))
  vi.runOnlyPendingTimers()
  expect(prefetch.start.mock.calls.map((args) => args[1])).toEqual(['hover', 'focus'])
})

it('cancels on network, offline and visibility changes', () => {
  const prefetch = setup()
  hover(link('/to'))
  network.saveData = true
  network.dispatchEvent(new Event('change'))
  dispatchEvent(new Event('offline'))
  Object.defineProperty(document, 'hidden', { configurable: true, value: true })
  document.dispatchEvent(new Event('visibilitychange'))
  expect(prefetch.cancel).toHaveBeenCalledTimes(3)
  delete (document as unknown as { hidden?: boolean }).hidden
})
