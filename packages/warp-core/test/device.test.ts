// Mobile is read from more than the window size: the UA hints, the UA, touch points on an iPad that says it's a Mac,
// and a coarse pointer with no hover. The palette switch writes data-palette and remembers it when asked.
import { vi } from 'vitest'
import { isMobileDevice, markDevice } from '../src/device'
import { getPalette, setPalette } from '../src/dial'

type Fake = { ua?: string; mobile?: boolean; touch?: number; coarse?: boolean; platform?: string }
const fake = ({
  ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)',
  mobile,
  touch = 0,
  coarse = false,
  platform = 'MacIntel',
}: Fake) =>
  ({
    navigator: {
      userAgent: ua,
      platform,
      maxTouchPoints: touch,
      ...(mobile !== undefined && { userAgentData: { mobile } }),
    },
    matchMedia: (q: string) => ({
      matches: coarse && /hover:\s*none|pointer:\s*coarse/.test(q),
      addEventListener() {},
    }),
  }) as unknown as Window

afterEach(() => {
  document.documentElement.removeAttribute('data-device')
  document.documentElement.removeAttribute('data-palette')
  localStorage.clear()
})

describe('isMobileDevice', () => {
  test('a desktop browser is not mobile, whatever its width', () => {
    expect(isMobileDevice(fake({}))).toBe(false)
  })
  test('UA client hints decide when present', () => {
    expect(isMobileDevice(fake({ mobile: true }))).toBe(true)
  })
  test('a phone UA is mobile', () => {
    expect(
      isMobileDevice(fake({ ua: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)' })),
    ).toBe(true)
    expect(isMobileDevice(fake({ ua: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) Mobile' }))).toBe(
      true,
    )
  })
  test('an iPad that reports itself as a Mac is caught by its touch points', () => {
    expect(isMobileDevice(fake({ touch: 5 }))).toBe(true)
  })
  test('a touch-only pointer with no hover is mobile; a touch laptop is not', () => {
    expect(
      isMobileDevice(
        fake({ ua: 'Mozilla/5.0 (X11; Linux x86_64)', platform: 'Linux', touch: 5, coarse: true }),
      ),
    ).toBe(true)
    expect(
      isMobileDevice(fake({ ua: 'Mozilla/5.0 (Windows NT 10.0)', platform: 'Win32', touch: 10 })),
    ).toBe(false)
  })
})

describe('markDevice', () => {
  test('marks <html> once, and leaves a value the page set', () => {
    markDevice(document)
    expect(document.documentElement.dataset.device).toMatch(/^(mobile|desktop)$/)
    document.documentElement.dataset.device = 'mobile'
    markDevice(document)
    expect(document.documentElement.dataset.device).toBe('mobile')
  })
})

describe('setPalette', () => {
  test('writes, announces, persists, and auto clears', () => {
    const seen = vi.fn()
    document.addEventListener('warp:dial', seen)
    setPalette('ocean', { persist: true })
    expect(document.documentElement.dataset.palette).toBe('ocean')
    expect(getPalette()).toBe('ocean')
    expect(JSON.parse(localStorage.getItem('warp:dials') ?? '{}').palette).toBe('ocean')
    expect(seen.mock.calls[0]?.[0].detail).toEqual({ name: 'palette', value: 'ocean' })
    setPalette('auto', { persist: true })
    expect(document.documentElement.hasAttribute('data-palette')).toBe(false)
    expect(JSON.parse(localStorage.getItem('warp:dials') ?? '{}').palette).toBeUndefined()
    document.removeEventListener('warp:dial', seen)
  })
  test('refuses a name that is not a CSS-safe identifier', () => {
    expect(() => setPalette('Ocean Blue')).toThrow(RangeError)
  })
})
