import { PALETTE } from '../field'

const TEAL = [
  [10, 46, 52],
  [14, 92, 100],
  [28, 150, 160],
  [90, 220, 225],
  [220, 255, 250],
]
export const CORAL = [
  [48, 22, 18],
  [110, 40, 30],
  [190, 70, 50],
  [250, 120, 90],
  [255, 225, 200],
]
const ramp = (r: number[][]) => [PALETTE[0]!, ...r.map((c) => [...c, 255])]
const RAMPS = [PALETTE, ramp(TEAL), ramp(CORAL)]
const tint = (c: number[], k: number) =>
  c.map((v, i) => (i < 3 ? Math.round(v + (255 - v) * k) : v))

/** Index = level + band × STEPS, as [r, g, b, a]. Bands: the field's green, teal, coral. Each ramp runs to near white, for a dark page. */
export const COLOURS = RAMPS.flat()

/**
 * The same indices for a light page: the field fades to pale tints and the lit levels take the ramp's own greens and
 * coral, darkest last, so the mark keeps the hero's exact colours rather than an inverted guess at them.
 */
export const LIGHT_COLOURS = RAMPS.flatMap((r) => [
  r[0]!,
  tint(r[3]!, 0.85),
  tint(r[3]!, 0.6),
  r[4]!,
  r[3]!,
  r[2]!,
])

export type Threads = { cover: Float32Array; born: Float32Array; band: Uint8Array }

// The house mark in its 24-unit box: four veneers, two kerfs.
export const VENEERS = [5, 10, 15, 20]
export const KERFS = [9, 15]
/** Where each kind of thread runs, in units: the kerfs overhang the outer veneers by the same 2.5 units each side. */
export const VENEER_SPAN = [3, 21]
export const KERF_SPAN = [2.5, 22.5]
/** The middle of the threads (x, y), which is what gets centred: the veneers' midpoint is 12.5, not the box's 12. */
export const MIDDLE = [12.5, 12]

type Frame = {
  ox: number
  oy: number
  unit: number
  half: number
  delay: number
  put: (x: number, y: number, a: number, at: number, b: number) => void
}

const edge = (half: number, d: number) => Math.min(1, Math.max(0, half + 0.5 - Math.abs(d)))

function veneerThreads({ ox, oy, unit, half, delay, put }: Frame) {
  VENEERS.forEach((wx, w) => {
    const cx = ox + wx * unit
    for (let y = Math.ceil(oy + VENEER_SPAN[0]! * unit); y < oy + VENEER_SPAN[1]! * unit; y++) {
      const at = delay + w * 0.12 + ((y - oy) / (24 * unit)) * 0.9
      for (let x = Math.floor(cx - half - 1); x <= cx + half + 1; x++)
        put(x, y, edge(half, x - cx), at, 0)
    }
  })
}

function kerfThreads({ ox, oy, unit, half, delay, put }: Frame) {
  KERFS.forEach((wy, j) => {
    const cy = oy + wy * unit
    for (let x = Math.ceil(ox + KERF_SPAN[0]! * unit); x < ox + KERF_SPAN[1]! * unit; x++) {
      const at = delay + 0.9 + j * 0.16 + ((x - ox) / (24 * unit)) * 0.9
      // The gap the kerf leaves where it dives under a veneer scales with the mark, or a small one loses its kerfs.
      const gap = half + Math.min(1.5, 0.4 * unit)
      const veneer = VENEERS.findIndex((wx) => Math.abs(x - (ox + wx * unit)) <= gap)
      const under = veneer >= 0 && (veneer + j) % 2 === 1 // over and under: a real weave
      for (let y = Math.floor(cy - half - 1); y <= cy + half + 1; y++)
        if (!under) put(x, y, edge(half, y - cy), at, 2)
    }
  })
}

/** The mark, large and centred. Each thread records when it reaches each cell, so the logo draws itself on. */
export function threads(
  cols: number,
  rows: number,
  delay = 0.2,
  centre = 0.5,
  size = 0.96,
): Threads {
  const cover = new Float32Array(cols * rows)
  const born = new Float32Array(cols * rows).fill(1e9)
  const band = new Uint8Array(cols * rows)
  const unit = (rows * size) / 24
  const put = (x: number, y: number, a: number, at: number, b: number) => {
    const i = y * cols + x
    if (x < 0 || y < 0 || x >= cols || y >= rows) return
    cover[i] = Math.max(cover[i]!, a)
    born[i] = Math.min(born[i]!, at)
    if (a > 0.5) band[i] = b
  }
  const frame = {
    ox: cols * centre - MIDDLE[0]! * unit,
    oy: rows / 2 - MIDDLE[1]! * unit,
    unit,
    half: Math.max(0.9, 0.62 * unit), // the mark's own proportion, down to threads two cells wide
    delay,
    put,
  }
  veneerThreads(frame)
  kerfThreads(frame)
  return { cover, born, band }
}
