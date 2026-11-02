// Threshold tiles: a square of values in 0–1 that decides, cell by cell, which of two inks a tone rounds to. Bayer, blue
// noise and halftone differ only in this table, so one quantizer draws them all. Sides are powers of two, so a lookup masks.
/** The ordered threshold patterns. */
export type Pattern = 'bayer2' | 'bayer4' | 'bayer8' | 'blue' | 'halftone'
/** A square threshold tile, `n` cells a side. */
export interface Tile { n: number; t: Float32Array }

function bayer(n: number) {
  let m = [0]
  for (let s = 1; s < n; s *= 2) {
    const next = Array<number>(s * s * 4)
    for (let y = 0; y < s; y++) for (let x = 0; x < s; x++) {
      const v = m[y * s + x]! * 4
      next[y * 2 * s + x] = v
      next[y * 2 * s + x + s] = v + 2
      next[(y + s) * 2 * s + x] = v + 3
      next[(y + s) * 2 * s + x + s] = v + 1
    }
    m = next
  }
  return Float32Array.from(m, v => (v + 0.5) / (n * n))
}

// Blue noise from nothing: each rank goes in the emptiest spot left, measured by a toroidal Gaussian around those already
// placed. It is the last phase of void-and-cluster, seeded so every page gets the same tile, and costs a few ms once.
function blue(n: number) {
  const size = n * n, R = 7, weight: number[] = []
  for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) weight.push(Math.exp(-(dx * dx + dy * dy) / 4.5))
  const energy = new Float32Array(size), out = new Float32Array(size).fill(-1)
  let seed = 0x9e3779b9
  for (let i = 0; i < size; i++) {
    seed = (seed + 0x6d2b79f5) | 0
    let r = Math.imul(seed ^ (seed >>> 15), 1 | seed)
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r
    energy[i] = ((r ^ (r >>> 14)) >>> 0) / 2 ** 32 * 1e-3
  }
  for (let rank = 0; rank < size; rank++) {
    let best = -1, low = Infinity
    for (let i = 0; i < size; i++) if (out[i]! < 0 && energy[i]! < low) { low = energy[i]!; best = i }
    out[best] = (rank + 0.5) / size
    const bx = best % n, by = (best / n) | 0
    let w = 0
    for (let dy = -R; dy <= R; dy++) for (let dx = -R; dx <= R; dx++) energy[((by + dy + n) % n) * n + (bx + dx + n) % n]! += weight[w++]!
  }
  return out
}

// Clustered dots on a 45° screen. Ranking the spot function keeps a flat tone's coverage exact.
function halftone(n: number) {
  const size = n * n, spot = new Float32Array(size), order = Array.from({ length: size }, (_, i) => i)
  for (let i = 0; i < size; i++) {
    const x = i % n, y = (i / n) | 0
    spot[i] = Math.cos(Math.PI * 2 * (x + y + 1) / n) + Math.cos(Math.PI * 2 * (x - y) / n)
  }
  order.sort((a, b) => spot[b]! - spot[a]! || a - b)
  const out = new Float32Array(size)
  order.forEach((at, rank) => { out[at] = 1 - (rank + 0.5) / size })
  return out
}

const made = new Map<Pattern, Tile>()

/** The threshold tile for `pattern`, built once. */
export function tile(pattern: Pattern): Tile {
  let t = made.get(pattern)
  if (!t) {
    const n = pattern === 'blue' ? 64 : pattern === 'halftone' ? 8 : Number(pattern.slice(5))
    t = { n, t: pattern === 'blue' ? blue(n) : pattern === 'halftone' ? halftone(n) : bayer(n) }
    made.set(pattern, t)
  }
  return t
}
