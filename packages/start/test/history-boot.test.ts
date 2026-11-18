// @vitest-environment jsdom
// @vitest-environment-options {"url":"http://localhost/"}
import { afterEach, expect, it, vi } from 'vitest'
import { listenHistory } from '../src/run/listeners'
import type { Navigation } from '../src/run/navigation'

function open(address: string, renderedPath: string, requested = renderedPath, shell = false) {
  history.replaceState(null, '', address)
  vi.stubGlobal('addEventListener', vi.fn())
  const getEntriesByType = vi.fn(() =>
    requested ? [{ name: new URL(requested, location.origin).href }] : [],
  )
  vi.stubGlobal('performance', { getEntriesByType })
  const nav = { at: '', committedURL: location.href, committedBase: document.baseURI, go: vi.fn() }
  listenHistory(nav as unknown as Navigation, renderedPath, shell)
  return { ...nav, getEntriesByType }
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
    expect(nav.getEntriesByType).not.toHaveBeenCalled()
  },
)

it('lets a shell take its normal arrival at the current address', () => {
  const nav = open('/requested?tab=1', '/shell', '/requested?tab=1', true)
  expect(nav.at).toBe('/requested?tab=1')
  expect(nav.go).not.toHaveBeenCalled()
  expect(nav.getEntriesByType).not.toHaveBeenCalled()
})

it.each(['/mount/rendered', '/rendered/', '/%72endered', '/rendered?q=%2f'])(
  'keeps the document at its requested address %s after a rewrite',
  (address) => {
    const nav = open(address, '/rendered', address)
    expect(nav.at).toBe(address)
    expect(nav.go).not.toHaveBeenCalled()
  },
)

it('reconciles a missed traversal from a rewritten document', () => {
  const nav = open('/other', '/rendered', '/mount/rendered/')
  expect(nav.at).toBe('/mount/rendered/')
  expect(nav.committedURL).toBe('http://localhost/mount/rendered/')
  expect(nav.go).toHaveBeenCalledExactlyOnceWith(location.href, { pop: true })
})

it('keeps the browser address when there is no document navigation entry', () => {
  const nav = open('/other', '/rendered', '')
  expect(nav.at).toBe('/other')
  expect(nav.go).not.toHaveBeenCalled()
})

it('preserves an explicit base for the retained page', () => {
  const base = document.createElement('base')
  base.href = '/assets/'
  document.head.append(base)
  const nav = open('/other', '/rendered')
  expect(nav.committedBase).toBe('http://localhost/assets/')
})
