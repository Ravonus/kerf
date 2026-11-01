// @weft/warp-core/canvas: a canvas that looks after itself (08 §6.7). It tracks size and pixel ratio, stops off screen and in
// a hidden tab, gives reduced motion one still frame, and shares one requestAnimationFrame between every surface on the
// page. With nothing to paint there is no frame scheduled at all, so an idle page costs nothing.
import { reducedMotion } from './motion'
import type { Action } from './store'

export interface Frame {
  ctx: CanvasRenderingContext2D
  /** CSS pixels, or cells when the surface has a `cell`. */
  width: number
  height: number
  dpr: number
  /** Seconds this surface has been moving: it does not advance while paused. */
  time: number
  dt: number
}

export interface SurfaceOptions {
  /** Paints one frame. Return true to be called again next frame, for work that settles on its own. */
  draw: (frame: Frame) => boolean | void
  animate?: boolean
  fps?: number
  /** Whole-cell mode: one backing pixel per cell, scaled up without smoothing and snapped to device pixels. */
  cell?: number
  maxDpr?: number
  context?: CanvasRenderingContext2DSettings
  /** Called when a theme, tier or motion dial changes around the canvas, before the repaint. */
  onTheme?: () => void
}

export interface Surface extends Action<SurfaceOptions> {
  /** Paint once, in the next shared frame. */
  invalidate(): void
  /** True while the canvas is on screen in a visible tab. */
  visible(): boolean
}

type Run = (now: number) => void
const queue = new Set<Run>()
let raf = 0

function pump(now: number) {
  raf = 0
  for (const run of [...queue]) run(now)
  if (queue.size) raf = requestAnimationFrame(pump)
}

function enqueue(run: Run) {
  queue.add(run)
  raf ||= requestAnimationFrame(pump)
}

// One observer for every surface: a dial is an attribute on any ancestor, and the OS settings are two media queries.
type Heard = (target: Node) => void
const hearers = new Set<Heard>()
let unhear: (() => void) | undefined

function hear(fn: Heard) {
  hearers.add(fn)
  if (!unhear) {
    const tell = (target: Node) => { for (const h of hearers) h(target) }
    const root = document.documentElement
    const dials = typeof MutationObserver === 'undefined' ? undefined : new MutationObserver(list => { for (const m of list) tell(m.target) })
    dials?.observe(root, { attributes: true, subtree: true, attributeFilter: ['data-theme', 'data-expression', 'data-motion'] })
    const media = typeof matchMedia === 'function' ? ['(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)'].map(q => matchMedia(q)) : []
    const change = () => tell(root)
    for (const m of media) m.addEventListener?.('change', change)
    unhear = () => { dials?.disconnect(); for (const m of media) m.removeEventListener?.('change', change); unhear = undefined }
  }
  return () => { hearers.delete(fn); if (!hearers.size) unhear?.() }
}

/** Attach to a `<canvas>`. It fills its parent, and its parent's size is what it tracks. */
export function surface(canvas: HTMLCanvasElement, options: SurfaceOptions): Surface {
  let o = options
  const box = canvas.parentElement ?? canvas
  const ctx = canvas.getContext('2d', o.context)
  let sized = false, dirty = true, seen = true, still = reducedMotion(canvas), kept = false
  let w = 0, h = 0, dpr = 1, time = 0, last = 0, shown = 0

  const running = () => (!!o.animate && !still) || kept
  const visible = () => seen && !document.hidden
  const wake = () => { if (visible() && (dirty || running())) enqueue(run) }
  const invalidate = () => { dirty = true; wake() }

  function measure() {
    const dw = box.clientWidth, dh = box.clientHeight
    dpr = Math.min(devicePixelRatio || 1, o.maxDpr ?? 2)
    if (!dw || !dh) return false
    let bw: number, bh: number
    if (o.cell) {
      const d = Math.max(1, Math.round(o.cell * dpr)), css = d / dpr
      bw = w = Math.ceil(dw / css)
      bh = h = Math.ceil(dh / css)
      canvas.style.width = `${bw * css}px`
      canvas.style.height = `${bh * css}px`
    } else {
      w = dw
      h = dh
      bw = Math.round(dw * dpr)
      bh = Math.round(dh * dpr)
    }
    if (canvas.width !== bw) canvas.width = bw
    if (canvas.height !== bh) canvas.height = bh
    if (!o.cell) ctx?.setTransform(dpr, 0, 0, dpr, 0, 0)
    return true
  }

  const run: Run = now => {
    if (!visible() || !ctx) return void queue.delete(run)
    if (!dirty && o.fps && now - shown < 1000 / o.fps - 2) return
    if (!sized && !(sized = measure())) return void queue.delete(run)
    const dt = last ? Math.min((now - last) / 1000, 0.1) : 0
    last = now
    shown = now
    if (running()) time += dt
    dirty = false
    kept = o.draw({ ctx, width: w, height: h, dpr, time, dt }) === true
    if (!running()) { queue.delete(run); last = 0 }
  }

  const size = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(() => { sized = false; invalidate() })
  size?.observe(box)
  const seer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(([e]) => {
    seen = e.isIntersecting
    box.toggleAttribute('data-fx-offscreen', !seen)
    last = 0
    wake()
  }, { rootMargin: '48px' })
  seer?.observe(canvas)
  const shown$ = () => { last = 0; wake() }
  const rescale = () => { sized = false; invalidate() }
  document.addEventListener('visibilitychange', shown$)
  addEventListener('resize', rescale)
  const stop = hear(target => {
    if (!target.contains(canvas)) return
    still = reducedMotion(canvas)
    o.onTheme?.()
    invalidate()
  })
  wake()

  return {
    invalidate,
    visible,
    update(next) {
      if (next.cell !== o.cell || next.maxDpr !== o.maxDpr) sized = false
      o = next
      invalidate()
    },
    destroy() {
      queue.delete(run)
      size?.disconnect()
      seer?.disconnect()
      stop()
      document.removeEventListener('visibilitychange', shown$)
      removeEventListener('resize', rescale)
    },
  }
}
