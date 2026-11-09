import { PALETTE } from '../field'

const TEAL = [
  [10, 46, 52],
  [14, 92, 100],
  [28, 150, 160],
  [90, 220, 225],
  [220, 255, 250],
]
const CORAL = [
  [48, 22, 18],
  [110, 40, 30],
  [190, 70, 50],
  [250, 120, 90],
  [255, 225, 200],
]
const ramp = (r: number[][]) => [PALETTE[0]!, ...r.map((c) => [...c, 255])]

/** Index = level + band × STEPS. Bands: the field's green, teal, coral. */
export const COLOURS = [PALETTE, ramp(TEAL), ramp(CORAL)]
  .flat()
  .map(([r, g, b, a]) => `rgba(${r},${g},${b},${a! / 255})`)

export type Threads = { cover: Float32Array; born: Float32Array; band: Uint8Array }

// The house mark in its 24-unit box: four warps, two wefts.
const WARPS = [5, 10, 15, 20]
const WEFTS = [9, 15]

type Frame = {
  ox: number
  oy: number
  unit: number
  half: number
  delay: number
  put: (x: number, y: number, a: number, at: number, b: number) => void
}

const edge = (half: number, d: number) => Math.min(1, Math.max(0, half + 0.5 - Math.abs(d)))

function warpThreads({ ox, oy, unit, half, delay, put }: Frame) {
  WARPS.forEach((wx, w) => {
    const cx = ox + wx * unit
    for (let y = Math.ceil(oy + 3 * unit); y < oy + 21 * unit; y++) {
      const at = delay + w * 0.12 + ((y - oy) / (24 * unit)) * 0.9
      for (let x = Math.floor(cx - half - 1); x <= cx + half + 1; x++)
        put(x, y, edge(half, x - cx), at, 0)
    }
  })
}

function weftThreads({ ox, oy, unit, half, delay, put }: Frame) {
  WEFTS.forEach((wy, j) => {
    const cy = oy + wy * unit
    for (let x = Math.ceil(ox + 2 * unit); x < ox + 22 * unit; x++) {
      const at = delay + 0.9 + j * 0.16 + ((x - ox) / (24 * unit)) * 0.9
      const warp = WARPS.findIndex((wx) => Math.abs(x - (ox + wx * unit)) <= half + 1.5)
      const under = warp >= 0 && (warp + j) % 2 === 1 // over and under: a real weave
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
    ox: cols * centre - 12 * unit,
    oy: rows / 2 - 12 * unit,
    unit,
    half: Math.max(1.4, 0.62 * unit),
    delay,
    put,
  }
  warpThreads(frame)
  weftThreads(frame)
  return { cover, born, band }
}
