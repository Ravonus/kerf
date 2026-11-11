// Is this a phone or tablet held in the hand? Width alone can't say: a narrow desktop window isn't a phone, and an iPad
// is as wide as a laptop. So this reads what the browser says about the device (Client Hints, the user agent, touch
// points) and how it's pointed at (a coarse pointer that can't hover), and only then the screen.

type Nav = Navigator & { userAgentData?: { mobile?: boolean } }

/** True for a phone or tablet: something used by touch, not a mouse or trackpad. */
export function isMobileDevice(win: Window = window): boolean {
  const nav = win.navigator as Nav
  if (nav.userAgentData?.mobile) return true
  const ua = nav.userAgent
  if (/iPhone|iPod|iPad|Android|Windows Phone|Mobi|Tablet|Silk|Kindle/i.test(ua)) return true
  // iPadOS asks for desktop sites and says it's a Mac; a Mac with a touch screen is an iPad
  if (/Macintosh/.test(ua) && nav.maxTouchPoints > 1) return true
  // anything else touch-first: a coarse pointer, no hover, and real touch points (not a desktop with a touch screen)
  const touchFirst = win.matchMedia?.('(hover: none) and (pointer: coarse)').matches ?? false
  return touchFirst && nav.maxTouchPoints > 0
}

// The value this module last wrote on each root: any other value there was set by the page, and stays.
const ours = new WeakMap<HTMLElement, string>()
const watched = new WeakSet<Window>()

/**
 * Sets `<html data-device="mobile|desktop">` for CSS, unless the page set it itself. Kept current when the main pointer
 * changes (a tablet docked to a keyboard and trackpad). Safe to call many times.
 */
export function markDevice(
  doc: Document | undefined = typeof document === 'undefined' ? undefined : document,
) {
  const win = doc?.defaultView
  if (!doc || !win) return
  const root = doc.documentElement
  const set = () => {
    const now = root.dataset.device
    if (now && now !== ours.get(root)) return // the page's own
    const value = isMobileDevice(win) ? 'mobile' : 'desktop'
    ours.set(root, value)
    root.dataset.device = value
  }
  set()
  if (watched.has(win)) return
  watched.add(win)
  win.matchMedia?.('(pointer: coarse)').addEventListener?.('change', set)
}
