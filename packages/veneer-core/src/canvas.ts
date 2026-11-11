// @kerf/veneer-core/canvas: a canvas that looks after itself (08 §6.7). It tracks size and pixel ratio, stops off screen and in
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

/** What a canvas's draw function gets each frame. */
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

/** Options for a canvas surface. */
export interface SurfaceOptions {
  /** Paints one frame. Return true to be called again next frame, for work that settles on its own. */
  draw: (frame: Frame) => boolean | void
  animate?: boolean | undefined
  fps?: number | undefined
  /** Whole-cell mode: one backing pixel per cell, scaled up without smoothing and snapped to device pixels. */
  cell?: number | undefined
  maxDpr?: number | undefined
  context?: CanvasRenderingContext2DSettings | undefined
  /** Track the pointer into `Frame.pointer`, and paint when it moves over the canvas. */
  pointer?: boolean | undefined
  /** Called when a theme, tier or motion dial changes around the canvas, before the repaint. */
  onTheme?: (() => void) | undefined
}

/** A canvas surface: the action, plus repainting on request and telling if it's seen. */
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
  // a snapshot: a run can add or drop itself mid-loop
  for (const run of [...queue]) run(now)
  if (queue.size) raf = requestAnimationFrame(pump)
}

function enqueue(run: Run) {
  queue.add(run)
  raf ||= requestAnimationFrame(pump)
}

// One observer for every surface: a dial is an attribute on any ancestor, and the OS settings are two media queries.
// A write of the value already there is no change: a repaint resolves its inks through a probe element, so hearing one
// would let any script that re-stamps a dial when the DOM changes spin the page forever, in microtasks.
type Heard = (target: Node) => void
const hearers = new Set<Heard>()
let unhear: (() => void) | undefined

function hear(fn: Heard) {
  hearers.add(fn)
  if (!unhear) {
    const tell = (target: Node) => {
      for (const h of hearers) h(target)
    }
    const root = document.documentElement
    const dials =
      typeof MutationObserver === 'undefined'
        ? undefined
        : new MutationObserver((list) => {
            for (const m of list)
              if ((m.target as Element).getAttribute(m.attributeName!) !== m.oldValue)
                tell(m.target)
          })
    dials?.observe(root, {
      attributes: true,
      attributeOldValue: true,
      subtree: true,
      attributeFilter: ['data-theme', 'data-expression', 'data-motion'],
    })
    const media =
      typeof matchMedia === 'function'
        ? ['(prefers-color-scheme: dark)', '(prefers-reduced-motion: reduce)'].map((q) =>
            matchMedia(q),
          )
        : []
    const change = () => tell(root)
    for (const m of media) m.addEventListener?.('change', change)
    unhear = () => {
      dials?.disconnect()
      for (const m of media) m.removeEventListener?.('change', change)
      unhear = undefined
    }
  }
  return () => {
    hearers.delete(fn)
    if (!hearers.size) unhear?.()
  }
}

// One listener for every surface that wants the pointer: the document's, which still hears it through content on top.
const trackers = new Set<(e: PointerEvent) => void>()
const tell = (e: Event) => {
  for (const t of trackers) t(e as PointerEvent)
}
const EVENTS = ['pointermove', 'pointerdown', 'pointerup', 'pointercancel'] as const

function track(fn: (e: PointerEvent) => void) {
  if (!trackers.size)
    for (const name of EVENTS) document.addEventListener(name, tell, { passive: true })
  trackers.add(fn)
  return () => {
    trackers.delete(fn)
    if (!trackers.size) for (const name of EVENTS) document.removeEventListener(name, tell)
  }
}

function surfacePointer(
  v: SurfaceState,
  box: HTMLElement,
  pointer: Pointer,
  visible: () => boolean,
  invalidate: () => void,
) {
  let untrack: (() => void) | undefined
  const follow = (e: PointerEvent) => {
    if (!visible()) return
    const r = box.getBoundingClientRect(),
      x = e.clientX - r.left,
      y = e.clientY - r.top
    const over = x >= 0 && y >= 0 && x < r.width && y < r.height,
      down = e.type === 'pointerdown' ? over : e.type === 'pointermove' ? pointer.down : false
    if (!over && !pointer.in && down === pointer.down) return
    pointer.x = x / v.unit
    pointer.y = y / v.unit
    pointer.in = over
    pointer.down = down
    invalidate()
  }
  const listen = () => {
    const enabled = !!v.o.pointer
    if (enabled && !untrack) untrack = track(follow)
    else if (!enabled && untrack) {
      untrack()
      untrack = undefined
    }
  }

  return { listen, destroy: () => untrack?.() }
}

type SurfaceState = {
  o: SurfaceOptions
  sized: boolean
  dirty: boolean
  seen: boolean
  still: boolean
  kept: boolean
  w: number
  h: number
  dpr: number
  time: number
  last: number
  shown: number
  unit: number
  dials: Tier | undefined
}

function measureSurface(
  v: SurfaceState,
  canvas: HTMLCanvasElement,
  box: HTMLElement,
  ctx: CanvasRenderingContext2D | null,
) {
  const dw = box.clientWidth,
    dh = box.clientHeight
  v.dpr = Math.min(devicePixelRatio || 1, v.o.maxDpr ?? 2)
  v.unit = 1
  if (!dw || !dh) return false
  let bw: number, bh: number
  if (v.o.cell) {
    const d = Math.max(1, Math.round(v.o.cell * v.dpr)),
      css = (v.unit = d / v.dpr)
    bw = v.w = Math.ceil(dw / css)
    bh = v.h = Math.ceil(dh / css)
    canvas.style.width = `${bw * css}px`
    canvas.style.height = `${bh * css}px`
    canvas.style.imageRendering = 'pixelated'
  } else {
    v.w = dw
    v.h = dh
    bw = Math.round(dw * v.dpr)
    bh = Math.round(dh * v.dpr)
  }
  if (canvas.width !== bw) canvas.width = bw
  if (canvas.height !== bh) canvas.height = bh
  if (!v.o.cell) ctx?.setTransform(v.dpr, 0, 0, v.dpr, 0, 0)
  return true
}

function runSurface(
  now: number,
  v: SurfaceState,
  s: {
    canvas: HTMLCanvasElement
    box: HTMLElement
    ctx: CanvasRenderingContext2D | null
    pointer: Pointer
    run: Run
    visible: () => boolean
    running: () => boolean
    moves: () => boolean
    dial: () => Tier
  },
) {
  const { canvas, box, ctx, pointer, run, visible, running, moves, dial } = s
  if (!visible() || !ctx) return void queue.delete(run)
  if (!v.dirty && v.o.fps && now - v.shown < 1000 / v.o.fps - 2) return
  if (!v.sized && !(v.sized = measureSurface(v, canvas, box, ctx))) return void queue.delete(run)
  const dt = v.last ? Math.min((now - v.last) / 1000, 0.1) : 0
  v.last = now
  v.shown = now
  if (running()) v.time += dt
  v.dirty = false
  v.kept =
    v.o.draw({
      ctx,
      width: v.w,
      height: v.h,
      dpr: v.dpr,
      time: v.time,
      dt,
      still: !moves(),
      tier: dial(),
      pointer,
    }) === true
  if (!running()) {
    queue.delete(run)
    v.last = 0
  }
}

function observeSurface(
  v: SurfaceState,
  canvas: HTMLCanvasElement,
  box: HTMLElement,
  invalidate: () => void,
  wake: () => void,
) {
  const size =
    typeof ResizeObserver === 'undefined'
      ? undefined
      : new ResizeObserver(() => {
          v.sized = false
          invalidate()
        })
  size?.observe(box)
  const seer =
    typeof IntersectionObserver === 'undefined'
      ? undefined
      : new IntersectionObserver(
          ([e]) => {
            v.seen = e!.isIntersecting
            box.toggleAttribute('data-fx-offscreen', !v.seen)
            v.last = 0
            wake()
          },
          { rootMargin: '48px' },
        )
  seer?.observe(canvas)
  const shown$ = () => {
    v.last = 0
    wake()
  }
  const rescale = () => {
    v.sized = false
    invalidate()
  }
  document.addEventListener('visibilitychange', shown$)
  addEventListener('resize', rescale)
  const stop = hear((target) => {
    if (!target.contains(canvas)) return
    v.still = reducedMotion(canvas)
    v.dials = undefined
    v.o.onTheme?.()
    invalidate()
  })
  return () => {
    size?.disconnect()
    seer?.disconnect()
    stop()
    document.removeEventListener('visibilitychange', shown$)
    removeEventListener('resize', rescale)
  }
}

/** Attach to a `<canvas>`. It fills its parent, and its parent's size is what it tracks. */
export function surface(canvas: HTMLCanvasElement, options: SurfaceOptions): Surface {
  const box = canvas.parentElement ?? canvas
  const ctx = canvas.getContext('2d', options.context)
  const v: SurfaceState = {
    o: options,
    sized: false,
    dirty: true,
    seen: true,
    still: reducedMotion(canvas),
    kept: false,
    w: 0,
    h: 0,
    dpr: 1,
    time: 0,
    last: 0,
    shown: 0,
    unit: 1,
    dials: undefined,
  }

  const pointer: Pointer = { x: 0, y: 0, down: false, in: false }

  const dial = () => (v.dials ??= tier(box))
  const moves = () => !!v.o.animate && !v.still && dial().speed > 0
  const running = () => moves() || v.kept
  const visible = () => v.seen && !document.hidden
  const wake = () => {
    if (visible() && (v.dirty || running())) enqueue(run)
  }
  const invalidate = () => {
    v.dirty = true
    wake()
  }

  const run: Run = (now) => runSurface(now, v, s)
  const s = { canvas, box, ctx, pointer, run, visible, running, moves, dial }

  const tracking = surfacePointer(v, box, pointer, visible, invalidate)

  const stop = observeSurface(v, canvas, box, invalidate, wake)
  tracking.listen()
  wake()

  return {
    invalidate,
    visible,
    update(next) {
      if (next.cell !== v.o.cell || next.maxDpr !== v.o.maxDpr) v.sized = false
      v.o = next
      tracking.listen()
      invalidate()
    },
    destroy() {
      queue.delete(run)
      tracking.destroy()
      stop()
    },
  }
}
