// @weft/warp-core/canvas: a canvas that looks after itself (08 §6.7). It tracks size and pixel ratio, stops off screen and in
// a hidden tab, gives reduced motion one still frame, and shares one requestAnimationFrame between every surface on the
// page. With nothing to paint there is no frame scheduled at all, so an idle page costs nothing.
import { tier, type Tier } from './dither/ramp'
import { reducedMotion } from './motion'
import type { Action } from './store'

/** Where the pointer is, in the frame's own units. It is tracked on the document, so content over the canvas doesn't hide it. */
export interface Pointer {
  x: number
  y: number
  down: boolean
  /** True while the pointer is over the canvas. */
  in: boolean
}

export interface Frame {
  ctx: CanvasRenderingContext2D
  /** CSS pixels, or cells when the surface has a `cell`. */
  width: number
  height: number
  dpr: number
  /** Seconds this surface has been moving: it does not advance while paused. */
  time: number
  dt: number
  /** True when this frame has no next one: quiet, reduced motion, or no `animate`. Paint the composed picture. */
  still: boolean
  /** The expression dial's numbers where the canvas sits. */
  tier: Tier
  /** Needs the `pointer` option; otherwise it stays at the origin, not `in`. */
  pointer: Pointer
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
  /** Track the pointer into `Frame.pointer`, and paint when it moves over the canvas. */
  pointer?: boolean
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

// One listener for every surface that wants the pointer: the document's, which still hears it through content on top.
const trackers = new Set<(e: PointerEvent) => void>()
const tell = (e: Event) => { for (const t of trackers) t(e as PointerEvent) }
const EVENTS = ['pointermove', 'pointerdown', 'pointerup', 'pointercancel'] as const

function track(fn: (e: PointerEvent) => void) {
  if (!trackers.size) for (const name of EVENTS) document.addEventListener(name, tell, { passive: true })
  trackers.add(fn)
  return () => {
    trackers.delete(fn)
    if (!trackers.size) for (const name of EVENTS) document.removeEventListener(name, tell)
  }
}

/** Attach to a `<canvas>`. It fills its parent, and its parent's size is what it tracks. */
export function surface(canvas: HTMLCanvasElement, options: SurfaceOptions): Surface {
  let o = options
  const box = canvas.parentElement ?? canvas
  const ctx = canvas.getContext('2d', o.context)
  let sized = false, dirty = true, seen = true, still = reducedMotion(canvas), kept = false
  let w = 0, h = 0, dpr = 1, time = 0, last = 0, shown = 0, unit = 1, dials: Tier | undefined, untrack: (() => void) | undefined
  const pointer: Pointer = { x: 0, y: 0, down: false, in: false }

  const dial = () => (dials ??= tier(box))
  const moves = () => !!o.animate && !still && dial().speed > 0
  const running = () => moves() || kept
  const visible = () => seen && !document.hidden
  const wake = () => { if (visible() && (dirty || running())) enqueue(run) }
  const invalidate = () => { dirty = true; wake() }

  function measure() {
    const dw = box.clientWidth, dh = box.clientHeight
    dpr = Math.min(devicePixelRatio || 1, o.maxDpr ?? 2)
    unit = 1
    if (!dw || !dh) return false
    let bw: number, bh: number
    if (o.cell) {
      const d = Math.max(1, Math.round(o.cell * dpr)), css = (unit = d / dpr)
      bw = w = Math.ceil(dw / css)
      bh = h = Math.ceil(dh / css)
      canvas.style.width = `${bw * css}px`
      canvas.style.height = `${bh * css}px`
      canvas.style.imageRendering = 'pixelated'
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
    kept = o.draw({ ctx, width: w, height: h, dpr, time, dt, still: !moves(), tier: dial(), pointer }) === true
    if (!running()) { queue.delete(run); last = 0 }
  }

  const follow = (e: PointerEvent) => {
    if (!visible()) return
    const r = box.getBoundingClientRect(), x = e.clientX - r.left, y = e.clientY - r.top
    const over = x >= 0 && y >= 0 && x < r.width && y < r.height, down = e.type === 'pointerdown' ? over : e.type === 'pointermove' ? pointer.down : false
    if (!over && !pointer.in && down === pointer.down) return
    pointer.x = x / unit
    pointer.y = y / unit
    pointer.in = over
    pointer.down = down
    invalidate()
  }
  const listen = () => {
    if (o.pointer && !untrack) untrack = track(follow)
    else if (!o.pointer && untrack) untrack = void untrack()
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
    dials = undefined
    o.onTheme?.()
    invalidate()
  })
  listen()
  wake()

  return {
    invalidate,
    visible,
    update(next) {
      if (next.cell !== o.cell || next.maxDpr !== o.maxDpr) sized = false
      o = next
      listen()
      invalidate()
    },
    destroy() {
      queue.delete(run)
      untrack?.()
      size?.disconnect()
      seer?.disconnect()
      stop()
      document.removeEventListener('visibilitychange', shown$)
      removeEventListener('resize', rescale)
    },
  }
}
