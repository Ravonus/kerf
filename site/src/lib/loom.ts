// The loom's engine: no framework and no DOM. A word and a logo as coverage masks, a spring lattice laid over them, and
// one function from a cell to a palette index. A caller decides how a cell reaches the screen. Liftable as it stands.
import { level, PALETTE } from './field'

const STEPS = PALETTE.length
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
  const ox = cols * centre - 12 * unit,
    oy = rows / 2 - 12 * unit
  const half = Math.max(1.4, 0.62 * unit)
  const put = (x: number, y: number, a: number, at: number, b: number) => {
    const i = y * cols + x
    if (x < 0 || y < 0 || x >= cols || y >= rows) return
    cover[i] = Math.max(cover[i]!, a)
    born[i] = Math.min(born[i]!, at)
    if (a > 0.5) band[i] = b
  }
  WARPS.forEach((wx, w) => {
    const cx = ox + wx * unit
    for (let y = Math.ceil(oy + 3 * unit); y < oy + 21 * unit; y++) {
      const at = delay + w * 0.12 + ((y - oy) / (24 * unit)) * 0.9
      for (let x = Math.floor(cx - half - 1); x <= cx + half + 1; x++)
        put(x, y, Math.min(1, Math.max(0, half + 0.5 - Math.abs(x - cx))), at, 0)
    }
  })
  WEFTS.forEach((wy, j) => {
    const cy = oy + wy * unit
    for (let x = Math.ceil(ox + 2 * unit); x < ox + 22 * unit; x++) {
      const at = delay + 0.9 + j * 0.16 + ((x - ox) / (24 * unit)) * 0.9
      const warp = WARPS.findIndex((wx) => Math.abs(x - (ox + wx * unit)) <= half + 1.5)
      const under = warp >= 0 && (warp + j) % 2 === 1 // over and under: a real weave
      for (let y = Math.floor(cy - half - 1); y <= cy + half + 1; y++) {
        const a = Math.min(1, Math.max(0, half + 0.5 - Math.abs(y - cy)))
        if (!under) put(x, y, a, at, 2)
      }
    }
  })
  return { cover, born, band }
}

export function weaver(cols: number, rows: number, word: Float32Array | null, logo: Threads) {
  const GAP = 5
  const nx = Math.ceil(cols / GAP) + 2,
    ny = Math.ceil(rows / GAP) + 2
  const ux = new Float32Array(nx * ny),
    uy = new Float32Array(nx * ny),
    vx = new Float32Array(nx * ny),
    vy = new Float32Array(nx * ny)
  let moving = false

  /** One tick of the lattice: each node springs home, leans on its neighbours (so a push travels), and loses a little. */
  const step = () => {
    let peak = 0
    for (let y = 1; y < ny - 1; y++)
      for (let x = 1; x < nx - 1; x++) {
        const i = y * nx + x
        vx[i] =
          (vx[i]! +
            (ux[i - 1]! + ux[i + 1]! + ux[i - nx]! + ux[i + nx]! - 4 * ux[i]!) * 0.2 -
            ux[i]! * 0.022) *
          0.955
        vy[i] =
          (vy[i]! +
            (uy[i - 1]! + uy[i + 1]! + uy[i - nx]! + uy[i + nx]! - 4 * uy[i]!) * 0.2 -
            uy[i]! * 0.022) *
          0.955
      }
    for (let i = 0; i < ux.length; i++) {
      ux[i]! += vx[i]!
      uy[i]! += vy[i]!
      peak = Math.max(peak, Math.abs(ux[i]!), Math.abs(uy[i]!), Math.abs(vx[i]!), Math.abs(vy[i]!))
    }
    moving = peak > 0.02
  }

  const around = (
    px: number,
    py: number,
    r: number,
    fn: (i: number, dx: number, dy: number, d: number) => void,
  ) => {
    const n = Math.ceil(r / GAP)
    const cx = Math.round(px / GAP),
      cy = Math.round(py / GAP)
    for (let y = Math.max(1, cy - n); y <= Math.min(ny - 2, cy + n); y++)
      for (let x = Math.max(1, cx - n); x <= Math.min(nx - 2, cx + n); x++) {
        const dx = x * GAP - px,
          dy = y * GAP - py
        fn(y * nx + x, dx, dy, Math.hypot(dx, dy))
      }
  }
  /** The pointer drags the threads it crosses and draws them toward it; the springs take them back. */
  const pull = (px: number, py: number, mx: number, my: number) => {
    around(px, py, 30, (i, dx, dy, d) => {
      const f = Math.exp(-(d * d) / 180)
      vx[i]! += (mx * 0.42 - dx * 0.018) * f
      vy[i]! += (my * 0.42 - dy * 0.018) * f
    })
    moving = true
  }
  /** A press kicks every nearby node outward; the lattice carries it across the field as a ring. */
  const shock = (px: number, py: number) => {
    around(px, py, 22, (i, dx, dy, d) => {
      const f = Math.exp(-(d * d) / 120) * 2.6
      const n = d || 1
      vx[i]! += (dx / n) * f
      vy[i]! += (dy / n) * f
    })
    moving = true
  }

  /** Palette index of cell (x, y). `t` drives the slow field, `clock` is seconds since the logo began. */
  const at = (x: number, y: number, t: number, clock: number) => {
    let sx = x,
      sy = y,
      energy = 0
    if (moving) {
      const gx = x / GAP,
        gy = y / GAP
      const ix = gx | 0,
        iy = gy | 0,
        fx = gx - ix,
        fy = gy - iy
      const a = iy * nx + ix,
        b = a + 1,
        c = a + nx,
        d = c + 1
      const dx =
        (ux[a]! * (1 - fx) + ux[b]! * fx) * (1 - fy) + (ux[c]! * (1 - fx) + ux[d]! * fx) * fy
      const dy =
        (uy[a]! * (1 - fx) + uy[b]! * fx) * (1 - fy) + (uy[c]! * (1 - fx) + uy[d]! * fx) * fy
      energy = Math.min(1, Math.hypot(dx, dy) * 0.09)
      sx = Math.max(0, Math.min(cols - 1, Math.round(x - dx)))
      sy = Math.max(0, Math.min(rows - 1, Math.round(y - dy)))
    }
    const i = sy * cols + sx
    const age = clock - logo.born[i]!
    const thread = age > 0 ? logo.cover[i]! * Math.min(1, age * 5) : 0
    const flash = age > 0 && age < 0.35 ? (0.35 - age) * 1.6 * logo.cover[i]! : 0
    // The shed: alternate threads rise as a slow wave crosses the cloth.
    const shed = ((x >> 1) ^ (y >> 1)) & 1 ? Math.sin(x * 0.07 + y * 0.045 - t * 2.4) * 0.09 : 0
    const v = level(
      x,
      y,
      cols,
      rows,
      t,
      (word ? word[i]! * 0.98 : 0) + thread * 0.5 + flash + energy * 0.8 + shed,
    )
    let band = energy > 0.34 ? 2 : energy > 0.14 ? 1 : thread > 0.5 ? logo.band[i]! : 0
    if (word && word[i]! > 0.5 && energy < 0.14) band = 0
    else if (!band && Math.sin((x / cols) * 3.1 + (y / rows) * 1.7 - t * 0.5) > 0.86) band = 1
    return v + band * STEPS
  }
  return { step, pull, shock, at, moving: () => moving }
}
