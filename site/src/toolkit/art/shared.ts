// What the art pieces share: their metadata, their inks, a little noise, and the rule that only three move at once.
export type Kind = 'field' | 'generative' | 'shader' | 'data' | 'pointer'

export interface Meta {
  name: string
  description: string
  kind: Kind
  /** The file's own source. */
  code: string
  /** Runs the full width of the gallery. */
  wide?: boolean
  /** Sits still until touched, so it never takes one of the three live slots. */
  rest?: boolean
}

export interface ArtProps {
  /** False holds a composed still. Pieces default to moving, so any of them works on its own. */
  live?: boolean
}

/** Tokens resolved where the canvas sits, and kept until `reset` (pass it as `onTheme`). */
export function inks<K extends string>(tokens: Record<K, string>) {
  let held: Record<K, string> | undefined
  const read = (el: HTMLElement) => {
    if (held) return held
    const probe = document.createElement('i'),
      out = {} as Record<K, string>
    probe.hidden = true
    el.parentElement!.append(probe)
    for (const key in tokens) {
      probe.style.color = `var(${tokens[key]})`
      out[key] = getComputedStyle(probe).color
    }
    probe.remove()
    return (held = out)
  }
  read.reset = () => {
    held = undefined
  }
  return read
}

export const clamp = (v: number, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v)
export const mix = (a: number, b: number, k: number) => a + (b - a) * k
export const smooth = (a: number, b: number, v: number) => {
  const k = clamp((v - a) / (b - a))
  return k * k * (3 - 2 * k)
}

/** A seeded generator in 0–1 (mulberry32). */
export function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const NOISE = 256,
  grid = new Float32Array(NOISE * NOISE)
{
  const r = rng(7)
  for (let i = 0; i < grid.length; i++) grid[i] = r()
}

/** Value noise in 0–1, smooth at every scale and cheap enough for a field. */
export function noise(x: number, y: number) {
  const ix = Math.floor(x),
    iy = Math.floor(y),
    fx = x - ix,
    fy = y - iy,
    u = fx * fx * (3 - 2 * fx),
    v = fy * fy * (3 - 2 * fy)
  const x0 = ix & 255,
    x1 = (x0 + 1) & 255,
    y0 = (iy & 255) << 8,
    y1 = (y0 + 256) & 65535
  const a = grid[y0 + x0]!,
    b = grid[y0 + x1]!,
    c = grid[y1 + x0]!,
    d = grid[y1 + x1]!
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v
}

export function fbm(x: number, y: number, octaves = 4) {
  let sum = 0,
    amp = 0.5,
    total = 0
  for (let i = 0; i < octaves; i++) {
    sum += noise(x, y) * amp
    total += amp
    amp *= 0.5
    x = x * 2.03 + 17.1
    y = y * 2.03 + 9.2
  }
  return sum / total
}

// The three-live rule. A stage enrols with a setter; the three most visible stages move, and a hovered one goes first.
const MAX = 3
interface Stage {
  set: (on: boolean) => void
  seen: number
  hot: boolean
  on: boolean
}
const stages = new Map<Element, Stage>()
let watcher: IntersectionObserver | undefined

function choose() {
  const ranked = [...stages.values()]
    .filter((s) => s.seen > 0)
    .sort((a, b) => +b.hot - +a.hot || b.seen - a.seen)
  const chosen = new Set(ranked.slice(0, MAX))
  for (const s of stages.values()) {
    const on = chosen.has(s)
    if (on !== s.on) s.set((s.on = on))
  }
}

export function enrol(el: Element, set: (on: boolean) => void) {
  const stage: Stage = { set, seen: 0, hot: false, on: false }
  stages.set(el, stage)
  watcher ??= new IntersectionObserver(
    (list) => {
      for (const e of list) {
        const s = stages.get(e.target)
        if (s) s.seen = e.isIntersecting ? e.intersectionRatio || 0.01 : 0
      }
      choose()
    },
    { threshold: [0, 0.2, 0.4, 0.6, 0.8, 1] },
  )
  watcher.observe(el)
  const enter = () => {
      stage.hot = true
      choose()
    },
    leave = () => {
      stage.hot = false
      choose()
    }
  el.addEventListener('pointerenter', enter)
  el.addEventListener('pointerleave', leave)
  return () => {
    watcher?.unobserve(el)
    el.removeEventListener('pointerenter', enter)
    el.removeEventListener('pointerleave', leave)
    stages.delete(el)
    choose()
  }
}
