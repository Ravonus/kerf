// Wheel and trackpad input. A gesture latches to the scroller it started on, as browsers do: one that starts at an
// edge goes to the scroller outside (or to the page), one that reaches an edge midway stays put.
import { registry, type Engine } from './engine'
import { normalizeWheel, pageStep } from './wheel'
import type { Axis } from './types'

const LATCH_MS = 300
const SETTLE_MS = 140
let latch: { owner: Engine | Element; t: number } | null = null

/** Listen for wheel events on the viewport. Returns the cleanup. */
export function wheelInput(e: Engine) {
  let settle: ReturnType<typeof setTimeout> | undefined
  const onWheel = (ev: WheelEvent) => {
    if (ev.defaultPrevented || ev.ctrlKey) return
    const o = e.o
    const step = normalizeWheel(ev, o.lineHeight, {
      x: pageStep(e.ax.x.view),
      y: pageStep(e.ax.y.view),
    })
    const dx = step.x * o.wheelSpeed
    const dy = step.y * o.wheelSpeed
    if (!dx && !dy) return
    if (!claims(e, ev, dx, dy)) return
    ev.preventDefault()
    latch = { owner: e, t: performance.now() }
    for (const [axis, d] of [
      ['x', dx],
      ['y', dy],
    ] as [Axis, number][]) {
      if (!d || !e.ax[axis].on) continue
      if (step.notched) e.tweenBy(axis, d, 'wheel')
      else {
        const a = e.ax[axis]
        const from = a.anim?.kind === 'tween' ? a.anim.to : a.pos
        e.moveTo(axis, from + d, 'wheel')
      }
    }
    clearTimeout(settle)
    settle = setTimeout(() => {
      e.settle('x')
      e.settle('y')
    }, SETTLE_MS)
  }
  e.vp.addEventListener('wheel', onWheel, { passive: false })
  if (!watching) {
    watching = true
    addEventListener('wheel', pageTook, { passive: true })
  }
  return () => {
    clearTimeout(settle)
    e.vp.removeEventListener('wheel', onWheel)
    if (latch?.owner === e) latch = null
  }
}

/** Whether this scroller takes the event: it is latched here, or a new gesture it can move with. */
function claims(e: Engine, ev: WheelEvent, dx: number, dy: number) {
  const live = latch && performance.now() - latch.t < LATCH_MS && performance.now() >= latch.t
  if (live && latch) {
    if (latch.owner === e) {
      latch.t = performance.now()
      return true
    }
    // Latched outside this scroller (a parent, or the page), or on a native scroller inside it: not ours.
    const el = latch.owner instanceof Element ? latch.owner : latch.owner.vp
    if (el.contains(e.vp) || (e.vp.contains(el) && el.contains(ev.target as Node))) {
      latch.t = performance.now()
      return false
    }
  }
  const native = nativeTaker(ev.target as Element, e.vp, dx, dy)
  if (native) {
    latch = { owner: native, t: performance.now() }
    return false
  }
  if (e.canMove('x', Math.sign(dx)) || e.canMove('y', Math.sign(dy))) return true
  if (e.o.chain === 'contain') return true
  // Handed on: a scroller outside may claim it; if none does, the page has it (see `pageTook`).
  handed = ev
  return false
}

let handed: WheelEvent | null = null
let watching = false
/** Passive, so it costs the page's own scrolling nothing: notes that a handed-on gesture went to the page. */
const pageTook = (ev: WheelEvent) => {
  if (ev === handed && !ev.defaultPrevented)
    latch = { owner: document.documentElement, t: performance.now() }
  handed = null
}

/** A natively scrolling element between the target and the viewport that can take this delta itself. */
function nativeTaker(target: Element | null, stop: Element, dx: number, dy: number) {
  for (let el = target; el && el !== stop; el = el.parentElement) {
    if (registry.has(el)) return null
    if (el.scrollHeight <= el.clientHeight && el.scrollWidth <= el.clientWidth) continue
    const s = getComputedStyle(el)
    const scrolls = (v: string) => v === 'auto' || v === 'scroll'
    if (dy && scrolls(s.overflowY) && room(el.scrollTop, el.scrollHeight - el.clientHeight, dy))
      return el
    if (dx && scrolls(s.overflowX)) {
      const wide = el.scrollWidth - el.clientWidth
      const rtl = s.direction === 'rtl'
      const at = rtl ? el.scrollLeft + wide : el.scrollLeft
      if (room(at, wide, dx)) return el
    }
  }
  return null
}

const room = (at: number, max: number, d: number) => (d > 0 ? at < max - 0.5 : at > 0.5)
