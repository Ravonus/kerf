// The bars: their elements and ARIA, when they show, and the frame each renderer is asked to paint.
import { thumbLength, thumbOffset } from './bar'
import type { AxisState, Engine } from './engine'
import type { BarFrame, Renderer } from './types'

/** The default renderer: a `data-part="thumb"` element per bar, sized and moved here, styled by CSS. */
export const domRenderer: Renderer = {
  mount(track) {
    if (track.querySelector('[data-part="thumb"]')) return
    const thumb = document.createElement('div')
    thumb.dataset.part = 'thumb'
    thumb.dataset.made = ''
    track.append(thumb)
  },
  draw(track, f) {
    const thumb = track.querySelector<HTMLElement>('[data-part="thumb"]')
    if (!thumb) return
    const y = f.axis === 'y'
    thumb.style.transform = y
      ? `translate3d(0,${f.thumb.y}px,0)`
      : `translate3d(${f.thumb.x}px,0,0)`
    thumb.style[y ? 'height' : 'width'] = `${y ? f.thumb.height : f.thumb.width}px`
  },
  unmount(track) {
    const thumb = track.querySelector<HTMLElement>('[data-part="thumb"]')
    if (thumb && thumb.dataset.made !== undefined) thumb.remove()
    else thumb?.style.removeProperty('transform')
  },
}

let ids = 0
const ARIA = [
  'role',
  'aria-controls',
  'aria-orientation',
  'aria-valuemin',
  'aria-valuemax',
  'aria-valuenow',
]

/** Find or make each bar's track, give it scrollbar semantics, and hand it to the renderer. */
export function mountBars(e: Engine, current: () => Renderer) {
  const renderer = current()
  const made: HTMLElement[] = []
  if (!e.vp.id) e.vp.id = `scroll-${(ids++).toString(36)}-${Math.random().toString(36).slice(2, 6)}`
  for (const a of e.axes) {
    if (!a.on) continue
    const orientation = a.axis === 'y' ? 'vertical' : 'horizontal'
    let track = e.root.querySelector<HTMLElement>(
      `:scope > [data-part="scrollbar"][data-orientation="${orientation}"]`,
    )
    if (!track) {
      track = document.createElement('div')
      track.dataset.part = 'scrollbar'
      track.dataset.orientation = orientation
      e.root.append(track)
      made.push(track)
    }
    track.setAttribute('role', 'scrollbar')
    track.setAttribute('aria-controls', e.vp.id)
    track.setAttribute('aria-orientation', orientation)
    track.setAttribute('aria-valuemin', '0')
    track.setAttribute('aria-valuemax', '100')
    track.setAttribute('aria-valuenow', '0')
    a.track = track
    renderer.mount(track, a.axis)
  }
  return () => {
    for (const a of e.axes) {
      if (!a.track) continue
      current().unmount(a.track)
      for (const name of ARIA) a.track.removeAttribute(name)
      a.track = null
      a.drawn = ''
      a.aria = -1
    }
    for (const t of made) t.remove()
  }
}

/** Paint whatever changed. Returns true while a hover grow is still easing (a renderer that animates it). */
export function drawBars(e: Engine, renderer: Renderer, dt: number) {
  let busy = false
  for (const a of e.axes) {
    if (!a.track) continue
    const target = a.hover || a.active ? 1 : 0
    if (a.grow !== target) {
      a.grow = renderer.animates && !e.reduced() ? ease(a.grow, target, dt) : target
      busy ||= a.grow !== target
    }
    const f = frame(e, a)
    const key = `${f.thumb.x}|${f.thumb.y}|${f.thumb.width}|${f.thumb.height}|${a.grow}|${a.hover}|${a.active}|${f.track.width}|${f.track.height}`
    if (key !== a.drawn) {
      a.drawn = key
      renderer.draw(a.track, f)
    }
    const now100 = Math.round(f.progress * 100)
    if (now100 !== a.aria) {
      a.aria = now100
      a.track.setAttribute('aria-valuenow', String(now100))
    }
  }
  return busy
}

const ease = (from: number, to: number, dt: number) => {
  const next = from + (to - from) * Math.min(1, dt / 70)
  return Math.abs(to - next) < 0.02 ? to : next
}

function frame(e: Engine, a: AxisState): BarFrame {
  const { bar } = e.o
  const range = a.max - a.min
  const progress = range > 0 ? (a.pos - a.min) / range : 0
  // A native thumb shrinks against the edge while the content is pulled past it.
  const len = Math.max(
    Math.min(8, a.trackLen),
    thumbLength(a.trackLen, a.view, a.total, e.o.thumb) - Math.abs(a.over) * 0.6,
  )
  const off =
    bar.inset +
    (a.over > 0 ? a.trackLen - len : a.over < 0 ? 0 : thumbOffset(a.trackLen, len, progress))
  a.thumbOff = off
  a.thumbLen = len
  const thick = bar.width + (bar.hoverWidth - bar.width) * a.grow
  const y = a.axis === 'y'
  const crossAt = y && e.rtl ? bar.inset : a.trackCross - bar.inset - thick
  return {
    axis: a.axis,
    track: y
      ? { width: a.trackCross, height: a.trackLen + 2 * bar.inset }
      : { width: a.trackLen + 2 * bar.inset, height: a.trackCross },
    thumb: y
      ? { x: crossAt, y: off, width: thick, height: len }
      : { x: off, y: crossAt, width: len, height: thick },
    grow: a.grow,
    hover: a.hover,
    active: a.active,
    progress: a.axis === 'x' && e.rtl ? 1 - progress : progress,
    rtl: e.rtl,
    bar,
  }
}

/** Which bars show, as data attributes the stylesheet fades on. */
export class Visibility {
  private timer: ReturnType<typeof setTimeout> | undefined
  private lastMove = 0
  scrolling = false
  inside = false

  constructor(private e: Engine) {}

  /** The position moved: show bars that show on scroll, and hide them again after the delay. */
  moved() {
    this.lastMove = performance.now()
    if (!this.scrolling) {
      this.scrolling = true
      this.e.root.toggleAttribute('data-scrolling', true)
      this.apply()
    }
    this.timer ??= setTimeout(this.idle, this.e.o.bar.hideDelay)
  }

  private idle = () => {
    this.timer = undefined
    const left = this.e.o.bar.hideDelay - (performance.now() - this.lastMove)
    if (left > 4) {
      this.timer = setTimeout(this.idle, left)
      return
    }
    this.scrolling = false
    this.e.root.toggleAttribute('data-scrolling', false)
    this.apply()
  }

  apply() {
    const { show } = this.e.o.bar
    for (const a of this.e.axes) {
      if (!a.track) continue
      const none = !a.on || a.max - a.min < 1
      a.track.toggleAttribute('data-none', none)
      this.e.root.toggleAttribute(`data-overflow-${a.axis}`, !none)
      const visible =
        !none &&
        (show === 'always' ||
          (show !== 'never' &&
            (this.scrolling || a.hover || a.active || (show === 'hover' && this.inside))))
      a.track.toggleAttribute('data-visible', visible)
      a.track.toggleAttribute('data-hover', a.hover)
      a.track.toggleAttribute('data-active', a.active)
    }
  }

  destroy() {
    clearTimeout(this.timer)
  }
}
