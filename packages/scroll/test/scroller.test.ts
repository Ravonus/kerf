// The engine in jsdom, with the layout it can't do stubbed in: keys, wheel, chaining, bars, ARIA and the API.
import { scroller, wrap } from '../src/index'
import { canvas } from '../src/canvas'
import type { ScrollOptions, ScrollState } from '../src/index'

beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'setTimeout',
      'clearTimeout',
      'performance',
    ],
  })
})
afterEach(() => {
  vi.useRealTimers()
  document.body.innerHTML = ''
})

/** Give an element the box jsdom can't lay out, and a scrollTop that clamps like a browser's. */
function box(el: HTMLElement, [w, h, sw, sh]: [number, number, number, number], rtl = false) {
  let top = 0
  let left = 0
  Object.defineProperties(el, {
    clientWidth: { get: () => w, configurable: true },
    clientHeight: { get: () => h, configurable: true },
    scrollWidth: { get: () => sw, configurable: true },
    scrollHeight: { get: () => sh, configurable: true },
    scrollTop: {
      get: () => top,
      set: (v: number) => {
        top = Math.max(0, Math.min(sh - h, v))
      },
      configurable: true,
    },
    scrollLeft: {
      get: () => left,
      set: (v: number) => {
        left = rtl ? Math.min(0, Math.max(w - sw, v)) : Math.max(0, Math.min(sw - w, v))
      },
      configurable: true,
    },
  })
  if (rtl) el.style.direction = 'rtl'
}

function area(o: ScrollOptions = {}, size = { w: 200, h: 100, sw: 200, sh: 1000 }) {
  const root = document.createElement('div')
  root.innerHTML =
    '<div data-part="viewport"><div data-part="content"><p>a</p><input id="field"></div></div>'
  document.body.append(root)
  const vp = root.firstElementChild as HTMLElement
  box(vp, [size.w, size.h, size.sw, size.sh])
  const s = scroller(root, o)
  return { root, vp, s }
}
const key = (el: Element, k: string, init: KeyboardEventInit = {}) => {
  const ev = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(ev)
  return ev
}
const wheel = (el: Element, init: WheelEventInit) => {
  const ev = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init })
  el.dispatchEvent(ev)
  return ev
}

test('the viewport is focusable, the bars are scrollbars that name it', () => {
  const { root, vp, s } = area({ label: 'Messages' })
  // It holds a field, so it isn't a tab stop of its own; with nothing focusable inside, it is.
  expect(vp.tabIndex).toBe(-1)
  vp.querySelector('input')!.remove()
  s.refresh()
  expect(vp.tabIndex).toBe(0)
  expect(vp.getAttribute('role')).toBe('region')
  expect(vp.getAttribute('aria-label')).toBe('Messages')
  const bars = root.querySelectorAll('[role="scrollbar"]')
  expect(bars).toHaveLength(2)
  for (const b of bars) {
    expect(b.getAttribute('aria-controls')).toBe(vp.id)
    expect(b.getAttribute('aria-valuenow')).toBe('0')
  }
  expect(root.hasAttribute('data-ready')).toBe(true)
  expect(root.hasAttribute('data-overflow-y')).toBe(true)
  expect(root.hasAttribute('data-overflow-x')).toBe(false)
})

test('arrow keys step a line, animated, and End reaches the bottom', () => {
  const { vp, root, s } = area()
  const ev = key(vp, 'ArrowDown')
  expect(ev.defaultPrevented).toBe(true)
  vi.advanceTimersByTime(400)
  expect(vp.scrollTop).toBe(40)
  key(vp, 'End')
  vi.advanceTimersByTime(400)
  expect(vp.scrollTop).toBe(900)
  expect(s.state().progressY).toBe(1)
  const bar = root.querySelector('[data-orientation="vertical"]')!
  expect(bar.getAttribute('aria-valuenow')).toBe('100')
})

test('a key at the edge is left for the page; typing in a field is never scrolling', () => {
  const { vp } = area()
  expect(key(vp, 'ArrowUp').defaultPrevented).toBe(false)
  expect(key(vp, 'Home').defaultPrevented).toBe(false)
  expect(key(vp.querySelector('#field')!, ' ').defaultPrevented).toBe(false)
  expect(key(vp.querySelector('#field')!, 'PageDown').defaultPrevented).toBe(false)
  expect(key(vp.querySelector('p')!, ' ').defaultPrevented).toBe(true)
})

test('Space pages down and Shift+Space back up', () => {
  const { vp } = area()
  key(vp, ' ')
  vi.advanceTimersByTime(400)
  expect(vp.scrollTop).toBe(87.5)
  key(vp, ' ', { shiftKey: true })
  vi.advanceTimersByTime(400)
  expect(vp.scrollTop).toBe(0)
})

test('trackpad pixels apply in the next frame; a wheel notch animates there', () => {
  const { vp } = area()
  const ev = wheel(vp, { deltaY: 30 })
  expect(ev.defaultPrevented).toBe(true)
  vi.advanceTimersByTime(16)
  expect(vp.scrollTop).toBe(30)
  wheel(vp, { deltaY: 3, deltaMode: 1 })
  vi.advanceTimersByTime(32)
  expect(vp.scrollTop).toBeGreaterThan(30)
  expect(vp.scrollTop).toBeLessThan(150)
  vi.advanceTimersByTime(400)
  expect(vp.scrollTop).toBe(150)
})

test('a gesture that starts at an edge goes to the scroller outside; contain keeps it', () => {
  const { vp } = area()
  expect(wheel(vp, { deltaY: -20 }).defaultPrevented).toBe(false)
  vi.advanceTimersByTime(500)
  const { vp: held } = area({ chain: 'contain' })
  expect(wheel(held, { deltaY: -20 }).defaultPrevented).toBe(true)
})

test('nested: the inner area scrolls first, and at its edge the outer one takes a new gesture', () => {
  const outer = area()
  const innerRoot = document.createElement('div')
  innerRoot.innerHTML = '<div data-part="viewport"><div data-part="content"></div></div>'
  outer.vp.firstElementChild!.append(innerRoot)
  const innerVp = innerRoot.firstElementChild as HTMLElement
  box(innerVp, [100, 50, 100, 80])
  scroller(innerRoot)
  wheel(innerVp, { deltaY: 20 })
  vi.advanceTimersByTime(16)
  expect(innerVp.scrollTop).toBe(20)
  expect(outer.vp.scrollTop).toBe(0)
  wheel(innerVp, { deltaY: 40 })
  vi.advanceTimersByTime(16)
  expect(innerVp.scrollTop).toBe(30)
  expect(outer.vp.scrollTop).toBe(0)
  vi.advanceTimersByTime(1000)
  wheel(innerVp, { deltaY: 25 })
  vi.advanceTimersByTime(16)
  expect(outer.vp.scrollTop).toBe(25)
})

test('a fixed thumb is the same size whatever the content', () => {
  const sizes: number[] = []
  for (const sh of [300, 3000, 300_000]) {
    const { root, s } = area({ thumb: { size: 30 } }, { w: 200, h: 100, sw: 200, sh })
    const track = root.querySelector<HTMLElement>('[data-orientation="vertical"]')!
    Object.defineProperty(track, 'clientHeight', { get: () => 100 })
    Object.defineProperty(track, 'clientWidth', { get: () => 14 })
    s.refresh()
    vi.advanceTimersByTime(16)
    const thumb = track.querySelector<HTMLElement>('[data-part="thumb"]')!
    sizes.push(parseFloat(thumb.style.height))
  }
  expect(sizes).toEqual([30, 30, 30])
})

test('onScroll hears every move with its source; the browser moving the viewport counts too', () => {
  const seen: ScrollState[] = []
  const { vp } = area({ onScroll: (st) => seen.push(st) })
  seen.length = 0
  wheel(vp, { deltaY: 10 })
  vi.advanceTimersByTime(16)
  expect(seen.at(-1)).toMatchObject({ y: 10, source: 'wheel' })
  vp.scrollTop = 200
  vp.dispatchEvent(new Event('scroll'))
  vi.advanceTimersByTime(16)
  expect(seen.at(-1)).toMatchObject({ y: 200, source: 'native' })
})

test('scrollTo is synchronous unless smooth; scrollIntoView places an element', () => {
  const { vp, s } = area()
  s.scrollTo({ top: 300 })
  expect(vp.scrollTop).toBe(300)
  s.scrollBy({ top: 100, behavior: 'smooth' })
  expect(vp.scrollTop).toBe(300)
  vi.advanceTimersByTime(400)
  expect(vp.scrollTop).toBe(400)
  const el = vp.querySelector('p')!
  vp.getBoundingClientRect = () =>
    ({ top: 0, left: 0, bottom: 100, right: 200, width: 200, height: 100 }) as DOMRect
  el.getBoundingClientRect = () =>
    ({ top: 250, left: 0, bottom: 270, right: 200, width: 200, height: 20 }) as DOMRect
  s.scrollIntoView(el, { block: 'center' })
  expect(vp.scrollTop).toBe(400 + 250 + 10 - 50)
})

test('reduced motion makes animated scrolls instant', () => {
  const { vp } = area({ motion: 'reduce' })
  key(vp, 'ArrowDown')
  vi.advanceTimersByTime(16)
  expect(vp.scrollTop).toBe(40)
})

test('mandatory snapping steps a notch at a time between points', () => {
  const { vp } = area({ snap: { points: [0, 250, 500, 750], type: 'mandatory' } })
  wheel(vp, { deltaY: 3, deltaMode: 1 })
  vi.advanceTimersByTime(500)
  expect(vp.scrollTop).toBe(250)
  key(vp, 'ArrowDown')
  vi.advanceTimersByTime(500)
  expect(vp.scrollTop).toBe(500)
})

test('right-to-left content scrolls into negative scrollLeft, with the thumb from the right', () => {
  const root = document.createElement('div')
  root.dir = 'rtl'
  root.innerHTML =
    '<div data-part="viewport" style="direction:rtl"><div data-part="content"></div></div>'
  document.body.append(root)
  const vp = root.firstElementChild as HTMLElement
  box(vp, [100, 100, 400, 100], true)
  const s = scroller(root, { axes: 'x' })
  expect(s.state()).toMatchObject({ maxX: -300, progressX: 0 })
  key(vp, 'ArrowLeft')
  vi.advanceTimersByTime(400)
  expect(vp.scrollLeft).toBe(-40)
  expect(s.state().progressX).toBeCloseTo(40 / 300)
})

test('the canvas renderer paints into a canvas in each track, and update swaps renderers back', () => {
  const { root, s } = area({ renderer: canvas() })
  expect(root.querySelectorAll('canvas')).toHaveLength(2)
  s.update({ renderer: undefined as never })
  s.destroy()
  expect(root.querySelectorAll('canvas')).toHaveLength(0)
  expect(root.querySelector('[role="scrollbar"]')).toBeNull()
  expect(root.hasAttribute('data-ready')).toBe(false)
})

test('wrap turns plain children into a scroll area and destroy puts them back', () => {
  const el = document.createElement('div')
  el.innerHTML = '<p>one</p><p>two</p>'
  document.body.append(el)
  const s = wrap(el)
  expect(el.querySelector('[data-part="viewport"] [data-part="content"] p')).not.toBeNull()
  s.destroy()
  expect(el.innerHTML).toBe('<p>one</p><p>two</p>')
})
