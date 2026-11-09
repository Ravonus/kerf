// Tones to inks. `v` holds tones in 0–1, one per cell, and a palette index 0 is the darkest or faintest ink.

/**
 * Ordered dither into a packed-RGBA `out`. Returns how many cells changed, so an unchanged frame can skip the canvas.
 * `spread` is how much of the step between two inks the tile may cross: 1 dithers fully, 0 bands.
 */
// oxlint-disable-next-line max-params -- public dither API; changing it is a breaking change
export function quantize(
  v: Float32Array,
  cols: number,
  rows: number,
  tile: { n: number; t: Float32Array },
  palette: Uint32Array,
  out: Uint32Array,
  spread = 1,
) {
  const top = palette.length - 1,
    n = tile.n,
    mask = n - 1,
    t = tile.t,
    shift = (1 - spread) / 2
  let changed = 0,
    i = 0
  for (let y = 0; y < rows; y++) {
    const row = (y & mask) * n
    for (let x = 0; x < cols; x++, i++) {
      const at = v[i]! * top + t[row + (x & mask)]! * spread + shift
      const ink = palette[at >= top ? top : at <= 0 ? 0 : at | 0]!
      if (out[i] !== ink) {
        out[i] = ink
        changed++
      }
    }
  }
  return changed
}

/** The error diffusion kernels. */
export type Diffusion = 'floyd' | 'atkinson'
const KERNELS: Record<Diffusion, { div: number; at: [dx: number, dy: number, w: number][] }> = {
  floyd: {
    div: 16,
    at: [
      [1, 0, 7],
      [-1, 1, 3],
      [0, 1, 5],
      [1, 1, 1],
    ],
  },
  // Atkinson hands on only 3/4 of the error, which is what keeps its lights clean.
  atkinson: {
    div: 8,
    at: [
      [1, 0, 1],
      [2, 0, 1],
      [-1, 1, 1],
      [0, 1, 1],
      [1, 1, 1],
      [0, 2, 1],
    ],
  },
}

/** Error diffusion for still images: serpentine, so it leaves no directional grain. Returns one palette index per cell. */
export function diffuse(
  v: Float32Array,
  cols: number,
  rows: number,
  inks: number,
  kind: Diffusion = 'floyd',
) {
  const top = inks - 1,
    work = v.map((x) => x * top),
    out = new Uint8Array(cols * rows),
    { div, at } = KERNELS[kind]
  for (let y = 0; y < rows; y++) {
    const dir = y & 1 ? -1 : 1
    for (let k = 0; k < cols; k++) {
      const x = dir > 0 ? k : cols - 1 - k,
        i = y * cols + x
      const level = Math.max(0, Math.min(top, Math.round(work[i]!)))
      const error = (work[i]! - level) / div
      out[i] = level
      for (const [dx, dy, w] of at) {
        const nx = x + dx * dir,
          ny = y + dy
        if (nx >= 0 && nx < cols && ny < rows) work[ny * cols + nx]! += error * w
      }
    }
  }
  return out
}

/** Stretches tones so the 1st to 99th percentile fill the range, which is what makes a dull photo dither well. */
export function levels(v: Float32Array, contrast = 1) {
  const bins = new Uint32Array(256)
  for (let i = 0; i < v.length; i++) bins[Math.max(0, Math.min(255, (v[i]! * 255) | 0))]!++
  const cut = v.length * 0.01
  let low = 0,
    high = 255
  // oxlint-disable-next-line no-unused-vars -- n is read by the condition, through the assignment
  for (let n = 0; low < 255 && (n += bins[low]!) < cut;) low++
  // oxlint-disable-next-line no-unused-vars -- n is read by the condition, through the assignment
  for (let n = 0; high > 0 && (n += bins[high]!) < cut;) high--
  const span = Math.max(1, high - low) / 255,
    base = low / 255
  for (let i = 0; i < v.length; i++) {
    const s = Math.max(0, Math.min(1, (v[i]! - base) / span))
    v[i] = Math.max(0, Math.min(1, (s - 0.5) * contrast + 0.5))
  }
  return v
}
