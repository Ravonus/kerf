// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}
import { afterEach, expect, it, vi } from 'vitest'
import { listenHistory } from '../src/run/listeners'
import type { Navigation } from '../src/run/navigation'

function open(address: string, renderedPath: string, shell = false) {
  history.replaceState(null, '', address)
  vi.stubGlobal('addEventListener', vi.fn())
  const nav = { at: '', committedURL: location.href, committedBase: document.baseURI, go: vi.fn() }
  listenHistory(nav as unknown as Navigation, renderedPath, shell)
  return nav
}

afterEach(() => {
  document.head.querySelector('base')?.remove()
  vi.unstubAllGlobals()
})

it.each(['/other', '/rendered?tab=2'])('reconciles a missed traversal to %s', (address) => {
  const nav = open(address, '/rendered?tab=1')
  expect(nav.at).toBe('/rendered?tab=1')
  expect(nav.committedURL).toBe('http://localhost/rendered?tab=1')
  expect(nav.committedBase).toBe(nav.committedURL)
  expect(nav.go).toHaveBeenCalledExactlyOnceWith(location.href, { pop: true })
})

it.each(['/rendered?tab=1', '/rendered?tab=1#section'])(
  'keeps the rendered route at %s',
  (address) => {
    const nav = open(address, '/rendered?tab=1')
    expect(nav.at).toBe('/rendered?tab=1')
    expect(nav.go).not.toHaveBeenCalled()
  },
)

it('lets a shell take its normal arrival at the current address', () => {
  const nav = open('/requested?tab=1', '/shell', true)
  expect(nav.at).toBe('/requested?tab=1')
  expect(nav.go).not.toHaveBeenCalled()
})

it('preserves an explicit base for the retained page', () => {
  const base = document.createElement('base')
  base.href = '/assets/'
  document.head.append(base)
  const nav = open('/other', '/rendered')
  expect(nav.committedBase).toBe('http://localhost/assets/')
})
