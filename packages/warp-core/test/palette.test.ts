import { afterEach, expect, it, vi } from 'vitest'
import { dialsFromUrl, getDial, setDial } from '../src/dial'

const root = document.documentElement

afterEach(() => {
  root.removeAttribute('data-palette')
  root.removeAttribute('data-theme')
  root.style.removeProperty('--warp-palette-names')
  root.style.removeProperty('--warp-palette-current')
  localStorage.clear()
  history.replaceState(null, '', '/')
  document.body.replaceChildren()
  vi.restoreAllMocks()
})

it('switches synchronously, announces, persists and resets the palette', () => {
  root.style.setProperty('--warp-palette-names', 'default ocean sunset')
  const events: unknown[] = []
  const listener = (event: Event) => events.push((event as CustomEvent).detail)
  document.addEventListener('warp:dial', listener)
  try {
    setDial('palette', 'ocean', { persist: true, url: true })
    expect(root.dataset.palette).toBe('ocean')
    expect(JSON.parse(localStorage.getItem('warp:dials')!).palette).toBe('ocean')
    expect(location.search).toBe('?palette=ocean')
    expect(events).toEqual([{ name: 'palette', value: 'ocean' }])
    setDial('palette', 'default', { persist: true })
    expect(JSON.parse(localStorage.getItem('warp:dials')!).palette).toBe('default')
    setDial('palette', 'auto', { persist: true, url: true })
    expect(root.dataset.palette).toBeUndefined()
    expect(JSON.parse(localStorage.getItem('warp:dials')!).palette).toBeUndefined()
    expect(location.search).toBe('')
  } finally {
    document.removeEventListener('warp:dial', listener)
  }
})

it('rejects unknown names and subtree persistence before any effects', () => {
  root.style.setProperty('--warp-palette-names', 'default ocean')
  const child = document.createElement('div')
  document.body.append(child)
  const event = vi.fn()
  document.addEventListener('warp:dial', event)
  try {
    expect(() => setDial('palette', 'unknown', { persist: true, url: true })).toThrow(RangeError)
    expect(() => setDial('palette', 'ocean', { root: child, persist: true })).toThrow(RangeError)
    expect(() => setDial('palette', 'ocean', { root: child, url: true })).toThrow(RangeError)
    expect(root.dataset.palette).toBeUndefined()
    expect(child.dataset.palette).toBeUndefined()
    expect(localStorage.getItem('warp:dials')).toBeNull()
    expect(location.search).toBe('')
    expect(event).not.toHaveBeenCalled()
    setDial('palette', 'ocean', { root: child })
    expect(child.dataset.palette).toBe('ocean')
  } finally {
    document.removeEventListener('warp:dial', event)
  }
})

it('uses the computed effective marker and ignores invalid URL palettes', () => {
  root.style.setProperty('--warp-palette-names', 'default ocean')
  root.style.setProperty('--warp-palette-current', 'ocean')
  expect(getDial('palette')).toBe('ocean')
  dialsFromUrl('?palette=missing&theme=dark')
  expect(root.dataset.palette).toBeUndefined()
  expect(root.dataset.theme).toBe('dark')
  dialsFromUrl('?palette=ocean')
  expect(root.dataset.palette).toBe('ocean')
})

it('allows only default and auto without configured metadata', () => {
  expect(() => setDial('palette', 'ocean')).toThrow(RangeError)
  setDial('palette', 'default')
  expect(getDial('palette')).toBe('default')
  setDial('palette', 'auto')
  expect(root.dataset.palette).toBeUndefined()
})
