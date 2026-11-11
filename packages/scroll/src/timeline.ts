// Keyframe tracks read at a position, and a section's scroll progress to drive them: the two halves of a
// scroll-scrubbed scene. Pure maths in `timeline`; `progress` is the only part that touches the page.
import { bezier, easings, Velocity } from './physics'
import type { Easing } from './types'

/** The handles of a CSS `cubic-bezier(x1, y1, x2, y2)`. */
export type Handles = readonly [x1: number, y1: number, x2: number, y2: number]

/** One keyframe: where on the timeline, the value there, and the curve used to arrive at it. */
export type Key = readonly [
  at: number,
  value: number,
  ease?: Easing | keyof typeof easings | Handles,
]

/** Named tracks of keyframes, as data: `{ fov: [[0, 40], [1, 28, 'easeInOut']] }`. */
export type Tracks = Readonly<Record<string, readonly Key[]>>

/** A set of tracks to read at any position. */
export interface Timeline<T extends Tracks> {
  /** Every track's value at `t`, written into one reused object. */
  at(t: number): { [K in keyof T]: number }
  /** One track's value at `t`. */
  value(name: keyof T, t: number): number
}

type Resolved = readonly [at: number, value: number, ease: Easing]

const curve = (ease: Key[2]): Easing =>
  typeof ease === 'function'
    ? ease
    : typeof ease === 'object'
      ? bezier(...ease)
      : easings[ease ?? 'easeInOut']

function sample(keys: readonly Resolved[], t: number) {
  const first = keys[0]!
  if (t <= first[0]) return first[1]
  for (let i = 1; i < keys.length; i++) {
    const to = keys[i]!
    if (t > to[0]) continue
    const from = keys[i - 1]!
    const span = to[0] - from[0]
    return span <= 0 ? to[1] : from[1] + (to[1] - from[1]) * to[2]((t - from[0]) / span)
  }
  return keys[keys.length - 1]![1]
}

/**
 * Keyframe tracks to scrub. Keys are sorted by position; a value holds before the first key and after the last.
 * A key's curve shapes the move into it: a name, a function, or cubic-bezier handles; it defaults to `easeInOut`.
 */
export function timeline<T extends Tracks>(tracks: T): Timeline<T> {
  const names = Object.keys(tracks) as (keyof T & string)[]
  const sorted = new Map<keyof T, readonly Resolved[]>()
  for (const name of names) {
    const keys = tracks[name]!.map((k): Resolved => [k[0], k[1], curve(k[2])]).sort(
      (a, b) => a[0] - b[0],
    )
    if (!keys.length) throw new Error(`timeline: track \`${name}\` has no keys`)
    sorted.set(name, keys)
  }
  const out = {} as { [K in keyof T]: number }
  return {
    at(t) {
      for (const name of names) out[name] = sample(sorted.get(name)!, t)
      return out
    },
    value: (name, t) => sample(sorted.get(name)!, t),
  }
}

/** Options for `progress`. */
export interface ProgressOptions {
  /**
   * `pin` (default): 0 when the section's top reaches the top of the viewport, 1 when its bottom reaches the
   * bottom, for a tall section holding a sticky scene. `through`: 0 as it enters from below, 1 as it leaves above.
   * `scene`: `through` in viewports instead of 0 to 1, for a scene on a stage pinned behind the page: 0 as the
   * section enters, 1 about as its top reaches the top, `(height + viewport) / viewport` as it leaves.
   */
  range?: 'pin' | 'through' | 'scene'
  /** With `scene`: how many viewports before the section enters its position starts moving. Default 0. */
  early?: number
  /** The element whose height is one viewport, for a stage sized `100lvh`. Default: the window's. */
  viewport?: Element
  /** Share of the remaining distance covered per 60 Hz frame, 0 to 1. Default 0.18; 1 follows the scroll exactly. */
  damp?: number
  /** `raw`: on a touch screen, whose own scrolling is already smooth, follow the scroll exactly. Default `ease`. */
  touch?: 'ease' | 'raw'
  /** Called with the eased position each time it moves, and once at the start. */
  onChange?: (value: number, target: number) => void
}

/** A section's live scroll progress. */
export interface Progress {
  /** The eased position, in `range`'s units. */
  readonly value: number
  /** Where the scroll is now, before easing. */
  readonly target: number
  /** How fast `target` moves, in its units per ms; 0 once the scroll has paused. */
  readonly velocity: number
  destroy(): void
}

/** Where `rect` stands in a viewport `height` tall, by `range`; `early` is `scene`'s lead, in viewports. */
export function progressOf(
  rect: { top: number; height: number },
  height: number,
  range = 'pin',
  early = 0,
) {
  const lead = range === 'scene' ? height * early : 0
  const span = range === 'pin' ? rect.height - height : rect.height + height + lead
  const done = range === 'pin' ? -rect.top : height + lead - rect.top
  const share = span <= 0 ? (done >= 0 ? 1 : 0) : Math.min(1, Math.max(0, done / span))
  return range === 'scene' ? (share * (rect.height + height)) / height : share
}

/**
 * Follows a section's scroll progress, eased so a scrubbed scene glides instead of stepping with the wheel.
 * It listens only while the page scrolls or resizes, and runs frames only while the value is still moving.
 * Under `prefers-reduced-motion: reduce` it follows the scroll exactly.
 */
export function progress(el: Element, options: ProgressOptions = {}): Progress {
  const matches = (query: string) => typeof matchMedia === 'function' && matchMedia(query).matches
  const still =
    matches('(prefers-reduced-motion: reduce)') ||
    (options.touch === 'raw' && matches('(pointer: coarse)'))
  const damp = still ? 1 : Math.min(1, Math.max(0.01, options.damp ?? 0.18))
  const speed = new Velocity()
  let value = -1
  let target = 0
  let raf = 0
  let last = 0

  const step = (now: number) => {
    raf = 0
    const frames = last ? Math.min(6, (now - last) / (1000 / 60)) : 1
    last = now
    const next = value < 0 ? target : value + (target - value) * (1 - (1 - damp) ** frames)
    const settled = Math.abs(target - next) < 0.0002
    const moved = settled ? target : next
    if (moved !== value) {
      value = moved
      options.onChange?.(value, target)
    }
    if (settled) last = 0
    else raf = requestAnimationFrame(step)
  }
  const where = () =>
    progressOf(
      el.getBoundingClientRect(),
      options.viewport?.clientHeight ?? innerHeight,
      options.range,
      options.early,
    )
  const read = () => {
    target = where()
    speed.add(performance.now(), 0, target)
    raf ||= requestAnimationFrame(step)
  }

  addEventListener('scroll', read, { passive: true, capture: true })
  addEventListener('resize', read, { passive: true })
  // The section's own box too: a stylesheet or font that lands late changes where it stands without a scroll.
  const box = typeof ResizeObserver === 'function' ? new ResizeObserver(read) : null
  box?.observe(el)
  target = where()
  value = target
  options.onChange?.(value, target)

  return {
    get value() {
      return value
    },
    get target() {
      return target
    },
    get velocity() {
      return speed.get(performance.now()).y
    },
    destroy() {
      removeEventListener('scroll', read, { capture: true })
      removeEventListener('resize', read)
      box?.disconnect()
      if (raf) cancelAnimationFrame(raf)
    },
  }
}
