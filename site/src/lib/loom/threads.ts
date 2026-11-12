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

// The house mark in its 24-unit box: a K cut in two. The upper piece is green, the lower coral, and the kerf between
// them runs up from the lower left. Both edges of the cut are parallel, so the gap is one width all along.
export const UPPER = [
  [2, 2.5],
  [8.4, 2.5],
  [8.4, 9.2],
  [14.6, 2.5],
  [22, 2.5],
  [16.6, 7.8],
  [2, 18.5],
] as const
export const LOWER = [
  [2, 20.2],
  [13.4, 11.8],
  [21.3, 21.5],
  [13, 21.5],
  [8.4, 16.2],
  [8.4, 21.5],
  [2, 21.5],
] as const
export const PIECES = [UPPER, LOWER] as const
/** The cut's centre line, from where it leaves the stem to where it ends in the upper arm. */
export const CUT = [
  [2, 19.35],
  [15, 9.8],
] as const

type Poly = readonly (readonly [number, number])[]

/** Whether (x, y), in units, is inside a piece: even-odd, so the stem's notch stays out. */
export function inside(poly: Poly, x: number, y: number) {
  let c = false
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i]!,
      [xj, yj] = poly[j]!
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) c = !c
  }
  return c
}

/** How far along the cut (x, y) lies, 0 where it starts and 1 where it ends: the order the blade reaches it. */
export function along(x: number, y: number) {
  const [[ax, ay], [bx, by]] = CUT
  const dx = bx - ax,
    dy = by - ay
  return ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy)
}

/** Which piece a point is in: 0 upper, 1 lower, -1 neither. */
export const pieceAt = (x: number, y: number) => PIECES.findIndex((p) => inside(p, x, y))

/**
 * The mark, large and centred. Each cell records how much of it the K covers (3×3 samples, so small marks keep their
 * edges) and when the blade reaches it: the K appears behind a cut that runs from the lower left to the upper right.
 */
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
  const ox = cols * centre - 12 * unit,
    oy = rows / 2 - 12 * unit
  const x0 = Math.max(0, Math.floor(ox + 1.5 * unit)),
    x1 = Math.min(cols, Math.ceil(ox + 22.5 * unit))
  const y0 = Math.max(0, Math.floor(oy + 2 * unit)),
    y1 = Math.min(rows, Math.ceil(oy + 22 * unit))
  for (let y = y0; y < y1; y++)
    for (let x = x0; x < x1; x++) {
      let hits = 0,
        lower = 0
      for (let sy = 0; sy < 3; sy++)
        for (let sx = 0; sx < 3; sx++) {
          const k = pieceAt((x + (sx + 0.5) / 3 - ox) / unit, (y + (sy + 0.5) / 3 - oy) / unit)
          if (k >= 0) hits++
          if (k === 1) lower++
        }
      if (!hits) continue
      const i = y * cols + x
      const ux = (x + 0.5 - ox) / unit,
        uy = (y + 0.5 - oy) / unit
      cover[i] = hits / 9
      band[i] = lower * 2 > hits ? 2 : 0
      born[i] = delay + 0.2 + Math.max(-0.4, Math.min(1.4, along(ux, uy))) * 0.8
    }
  return { cover, born, band }
}
