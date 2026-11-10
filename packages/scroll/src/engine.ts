// The scroller's state and its one frame loop. The viewport stays a real scroll container with `overflow: hidden`:
// the engine writes scrollTop and scrollLeft, so focus, find-in-page, anchors, sticky positioning, screen readers and
// any library listening for `scroll` (a virtualizer) keep working. Input modules only move numbers here.
import { coast, rubber, spring, unrubber } from './physics'
import { snapStep, snapTo } from './snap'
import { axisState, type AxisState } from './axis'
import type { Resolved } from './options'
import type { Axis, ScrollSource, ScrollState } from './types'

export type { AxisState } from './axis'

let query: MediaQueryList | null | undefined
/** One shared query for every scroller: making a MediaQueryList costs more than the rest of a scroller's setup. */
export const reduceQuery = () =>
  (query ??=
    typeof matchMedia === 'function' ? matchMedia('(prefers-reduced-motion: reduce)') : null)

/** Every live scroller by its viewport, so nested ones can find the one outside them. */
export const registry = new WeakMap<Element, Engine>()

export class Engine {
  readonly ax = { x: axisState('x'), y: axisState('y') }
  rtl = false
  source: ScrollSource = 'api'
  frame = 0
  last = 0
  dispatching = false
  measured = false
  private dirty = false
  /** Runs after each frame's writes: the bars draw here. */
  onFrame: (now: number) => boolean = () => false
  /** Runs after an autoscroll step, so a held selection can follow the content. */
  afterAuto: (() => void) | null = null
  /** Runs when the position moves for any reason: the bars show. */
  onActivity: () => void = () => {}
  /** What `destroy` runs. */
  destroyHooks: (() => void)[] = []

  constructor(
    readonly root: HTMLElement,
    readonly vp: HTMLElement,
    public content: HTMLElement | null,
    public o: Resolved,
  ) {}

  get axes(): AxisState[] {
    return [this.ax.x, this.ax.y]
  }

  reduced() {
    return this.o.motion === 'reduce' || (this.o.motion === 'auto' && !!reduceQuery()?.matches)
  }

  parent(): Engine | null {
    const up = this.root.parentElement?.closest('[data-scroll-viewport]')
    return (up && registry.get(up)) || null
  }

  /** Read sizes and the position from the DOM. Only call where layout is already clean or a read is wanted. */
  measure() {
    this.measured = true
    const { vp } = this
    this.rtl = getComputedStyle(vp).direction === 'rtl'
    const { x, y } = this.ax
    y.view = vp.clientHeight
    y.total = vp.scrollHeight
    y.max = Math.max(0, y.total - y.view)
    x.view = vp.clientWidth
    x.total = vp.scrollWidth
    const wide = Math.max(0, x.total - x.view)
    x.min = this.rtl ? -wide : 0
    x.max = this.rtl ? 0 : wide
    for (const a of this.axes) {
      if (!a.anim && a.pos === a.written)
        a.pos = a.written = a.axis === 'y' ? vp.scrollTop : vp.scrollLeft
      a.pos = clamp(a.pos, a.min, a.max)
      if (a.track) {
        const inset = this.o.bar.inset
        const long = a.axis === 'y' ? a.track.clientHeight : a.track.clientWidth
        a.trackLen = Math.max(0, long - 2 * inset)
        a.trackCross = a.axis === 'y' ? a.track.clientWidth : a.track.clientHeight
      }
    }
    this.measureSnap()
    this.dirty = true
  }

  private measureSnap() {
    const s = this.o.snap
    for (const a of this.axes) a.points = []
    if (!s) return
    const a = this.ax[s.axis ?? 'y']
    const given = typeof s.points === 'function' ? s.points() : (s.points ?? [])
    a.points = [...given]
    if (!s.selector) return
    const box = this.vp.getBoundingClientRect()
    const y = a.axis === 'y'
    for (const el of this.vp.querySelectorAll(s.selector)) {
      const r = el.getBoundingClientRect()
      const at = (y ? r.top - box.top : r.left - box.left) + a.pos
      const size = y ? r.height : r.width
      const align = s.align ?? 'start'
      a.points.push(
        align === 'start' ? at : align === 'end' ? at + size - a.view : at + size / 2 - a.view / 2,
      )
    }
  }

  /** Measure now if no ResizeObserver has yet: input or an API call before the first layout batch. */
  ready() {
    if (!this.measured) this.measure()
  }

  canMove(axis: Axis, dir: number) {
    this.ready()
    const a = this.ax[axis]
    if (!a.on || a.max - a.min < 1) return false
    return dir > 0 ? a.pos < a.max - 0.5 : dir < 0 ? a.pos > a.min + 0.5 : false
  }

  wake() {
    if (!this.frame && typeof requestAnimationFrame === 'function') {
      this.frame = requestAnimationFrame(this.tick)
      this.last = 0
    }
  }

  stop(axis?: Axis) {
    for (const a of this.axes) {
      if (axis && a.axis !== axis) continue
      if (a.anim?.kind === 'spring') continue
      a.anim = null
      a.v = 0
    }
  }

  /** Move straight there: a trackpad delta, a finger, a thumb drag. */
  moveTo(axis: Axis, to: number, source: ScrollSource) {
    this.ready()
    const a = this.ax[axis]
    if (a.anim?.kind !== 'spring') a.anim = null
    a.pos = clamp(to, a.min, a.max)
    this.source = source
    this.wake()
  }

  /** Animate there over `duration`, or jump when motion is reduced. */
  tweenTo(
    axis: Axis,
    to: number,
    source: ScrollSource,
    dur = this.o.duration,
    ease = this.o.easing,
  ) {
    this.ready()
    const a = this.ax[axis]
    const end = clamp(to, a.min, a.max)
    this.source = source
    if (dur <= 0 || this.reduced()) return this.moveTo(axis, end, source)
    a.anim = { kind: 'tween', from: a.pos, to: end, start: -1, dur, ease }
    this.wake()
  }

  /** Add to where any running animation is heading, as successive wheel notches and key repeats do. */
  tweenBy(axis: Axis, d: number, source: ScrollSource) {
    const a = this.ax[axis]
    const from = a.anim?.kind === 'tween' ? a.anim.to : a.pos
    const snapped = this.o.snap?.type === 'mandatory' && a.points.length
    this.tweenTo(axis, snapped ? snapStep(a.points, from, Math.sign(d), a.max) : from + d, source)
  }

  /** A finger or grab drag: `raw` is where the finger puts the content, maybe past an edge. */
  drag(axis: Axis, raw: number) {
    const a = this.ax[axis]
    a.anim = null
    const pos = clamp(raw, a.min, a.max)
    a.pos = pos
    a.over = this.o.overscroll === 'bounce' && !this.reduced() ? rubber(raw - pos, a.view) : 0
    this.source = 'touch'
    this.wake()
  }

  /** Where a drag would start from now, overscroll included, so catching a bounce doesn't jump. */
  rawPos(axis: Axis) {
    this.ready()
    const a = this.ax[axis]
    return a.pos + unrubber(a.over, a.view)
  }

  /** A finger lifted with velocity `v` (px/ms, content direction): bounce back, coast, or glide to a snap point. */
  release(axis: Axis, v: number) {
    const a = this.ax[axis]
    if (a.over) {
      a.anim = { kind: 'spring', x0: a.over, v0: 0, start: -1 }
      return this.wake()
    }
    const glide = this.o.momentum ? v : 0
    if (a.points.length) {
      const end = a.pos + (Math.abs(glide) > 0.05 ? glide / -Math.log(this.o.friction) : 0)
      const to = snapTo(a.points, end, { ...this.o.snap, dir: Math.sign(glide), max: a.max })
      if (to !== end || this.o.snap?.type === 'mandatory') {
        const dur =
          Math.abs(glide) > 0.05
            ? clamp((3 * Math.abs(to - a.pos)) / Math.abs(glide), 180, 900)
            : 260
        return this.tweenTo(axis, to, 'snap', dur)
      }
    }
    if (Math.abs(glide) > 0.05) {
      a.anim = { kind: 'coast', v: glide }
      this.wake()
    }
  }

  /** Scrolling stopped: rest on a snap point if one applies. */
  settle(axis: Axis) {
    const a = this.ax[axis]
    if (!a.points.length || a.anim) return
    const to = snapTo(a.points, a.pos, { ...this.o.snap, max: a.max })
    if (Math.abs(to - a.pos) > 0.5) this.tweenTo(axis, to, 'snap')
  }

  /** Keep scrolling at `v` px/ms until called with 0: selection and drag autoscroll. */
  auto(axis: Axis, v: number) {
    const a = this.ax[axis]
    if (!v) {
      if (a.anim?.kind === 'auto') a.anim = null
      return
    }
    a.anim = { kind: 'auto', v }
    this.source = 'select'
    this.wake()
  }

  /** The browser moved the viewport (focus, find, an anchor, someone else's scrollTop): adopt it. */
  adopt() {
    for (const a of this.axes) {
      const now = a.axis === 'y' ? this.vp.scrollTop : this.vp.scrollLeft
      if (Math.abs(now - a.written) <= 1) continue
      a.anim = null
      a.pos = a.written = now
      this.source = 'native'
      this.dirty = true
    }
    if (this.dirty) this.wake()
  }

  private step(a: AxisState, now: number, dt: number) {
    const m = a.anim
    if (!m) return false
    if (m.kind === 'tween') {
      if (m.start < 0) m.start = now - 16
      const t = Math.min(1, (now - m.start) / m.dur)
      const before = a.pos
      a.pos = clamp(m.from + (m.to - m.from) * m.ease(t), a.min, a.max)
      a.v = dt ? (a.pos - before) / dt : 0
      if (t < 1) return true
      a.anim = null
      a.v = 0
      return false
    }
    if (m.kind === 'coast') return this.coastStep(a, m, dt)
    if (m.kind === 'spring') {
      if (m.start < 0) m.start = now - 16
      const t = now - m.start
      a.over = spring(m.x0, m.v0, t)
      if (t > 60 && Math.abs(a.over) < 0.4) {
        a.over = 0
        a.anim = null
        return false
      }
      return true
    }
    a.pos = clamp(a.pos + m.v * dt, a.min, a.max)
    this.afterAuto?.()
    return true
  }

  private coastStep(a: AxisState, m: { v: number }, dt: number) {
    const { moved, v } = coast(m.v, this.o.friction, dt)
    const next = a.pos + moved
    m.v = a.v = v
    if (next < a.min || next > a.max) {
      a.pos = clamp(next, a.min, a.max)
      const bounce = this.o.overscroll === 'bounce' && !this.reduced() && Math.abs(v) > 0.2
      a.anim = bounce ? { kind: 'spring', x0: 0, v0: v, start: -1 } : null
      return bounce
    }
    a.pos = next
    if (Math.abs(v) >= 0.01) return true
    a.anim = null
    a.v = 0
    this.settle(a.axis)
    return !!a.anim
  }

  tick = (now: number) => {
    this.frame = 0
    const dt = this.last ? Math.min(64, now - this.last) : 16
    this.last = now
    let busy = false
    for (const a of this.axes) if (this.step(a, now, dt)) busy = true
    const moved = this.write()
    if (moved) this.onActivity()
    if (this.onFrame(now)) busy = true
    if (moved || this.dirty) this.emit()
    this.dirty = false
    if (busy) {
      this.frame = requestAnimationFrame(this.tick)
    } else this.last = 0
  }

  /** Write positions and overscroll to the DOM. Returns whether anything moved. */
  write() {
    const { x, y } = this.ax
    let moved = false
    if (y.pos !== y.written) {
      this.vp.scrollTop = y.written = y.pos
      moved = true
    }
    if (x.pos !== x.written) {
      this.vp.scrollLeft = x.written = x.pos
      moved = true
    }
    const over = `${x.over}|${y.over}`
    if (this.content && this.content.dataset.over !== over) {
      this.content.dataset.over = over
      this.content.style.transform =
        x.over || y.over ? `translate3d(${-x.over}px, ${-y.over}px, 0)` : ''
      moved = true
    }
    if (moved && this.o.syncEvents) {
      this.dispatching = true
      this.vp.dispatchEvent(new Event('scroll'))
      this.dispatching = false
    }
    return moved
  }

  state(): ScrollState {
    this.ready()
    const { x, y } = this.ax
    const px = x.max - x.min > 0 ? (x.pos - x.min) / (x.max - x.min) : 0
    return {
      x: x.pos,
      y: y.pos,
      maxX: this.rtl ? x.min : x.max,
      maxY: y.max,
      progressX: this.rtl ? 1 - px : px,
      progressY: y.max > 0 ? y.pos / y.max : 0,
      overscrollX: x.over,
      overscrollY: y.over,
      velocityX: x.v,
      velocityY: y.v,
      source: this.source,
    }
  }

  emit() {
    this.o.onScroll?.(this.state())
  }
}

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v))
