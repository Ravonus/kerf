// The numbers behind the feel: easing curves, inertia, the rubber band and the spring back. Pure, so tests pin them.
import type { Easing } from './types'

/** Ease-out with a soft landing; the curve browsers use for smooth scrolling is close to this. */
export const easeOut: Easing = (t) => 1 - (1 - t) ** 3
/** Named curves to pass as `easing`. */
export const easings = {
  linear: (t: number) => t,
  easeOut,
  easeOutQuint: (t: number) => 1 - (1 - t) ** 5,
  easeInOut: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2),
  /** Exponential ease-out: quick start, long tail, like a coasting fling. */
  expo: (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t)),
} satisfies Record<string, Easing>

/** Where a coast from velocity `v` (px/ms) ends, with `friction` kept per ms. */
export function coastDistance(v: number, friction: number) {
  return friction >= 1 || friction <= 0 ? 0 : v / -Math.log(friction)
}

/** Advance a coast by `dt` ms: the distance moved and the velocity left. */
export function coast(v: number, friction: number, dt: number) {
  const k = friction ** dt
  return { moved: coastDistance(v, friction) * (1 - k), v: v * k }
}

/** How far content follows a finger dragged `excess` px past an edge of a `size` px viewport. */
export function rubber(excess: number, size: number) {
  if (!excess || size <= 0) return 0
  const s = Math.sign(excess)
  return s * (1 - 1 / ((Math.abs(excess) * 0.55) / size + 1)) * size
}

/** The finger distance that gives `offset` of rubber band: `rubber`'s inverse. */
export function unrubber(offset: number, size: number) {
  if (!offset || size <= 0) return 0
  const a = Math.min(Math.abs(offset), size * 0.999)
  return (Math.sign(offset) * (size / (1 - a / size) - size)) / 0.55
}

/** A critically damped spring toward 0, from `x0` with velocity `v0`: where it is after `t` ms. */
export function spring(x0: number, v0: number, t: number, omega = 0.014) {
  return (x0 + (v0 + omega * x0) * t) * Math.exp(-omega * t)
}

/** Tracks pointer velocity over the last ~100 ms, as touch scrollers do, so a pause before lifting stops a fling. */
export class Velocity {
  private samples: { t: number; x: number; y: number }[] = []
  reset() {
    this.samples.length = 0
  }
  add(t: number, x: number, y: number) {
    this.samples.push({ t, x, y })
    while (this.samples.length > 2 && t - this.samples[0]!.t > 100) this.samples.shift()
  }
  /** px per ms, pointing the way the content should move. Zero when the last move is stale. */
  get(now: number) {
    const s = this.samples
    const last = s.at(-1)
    const first = s[0]
    if (!last || !first || last === first || now - last.t > 50) return { x: 0, y: 0 }
    const dt = Math.max(1, last.t - first.t)
    return { x: (last.x - first.x) / dt, y: (last.y - first.y) / dt }
  }
}
