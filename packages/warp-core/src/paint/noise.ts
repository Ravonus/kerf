// Seeded randomness: a picture made from the same name comes out the same everywhere.

/** A seeded random stream in 0 to 1 (mulberry32). */
export function rng(seed: number) {
  let s = seed >>> 0
  return () => {
    s = (s + 0x6d2b79f5) | 0
    let t = Math.imul(s ^ (s >>> 15), 1 | s)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** A text's 32-bit FNV-1a hash: a seed from a name. */
export function hash(text: string) {
  let h = 2166136261
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619)
  return h >>> 0
}

/** Smooth 1D value noise in −1 to 1, for ruffled leaves, wavy pours and uneven edges. */
export function wave(seed: number, x: number, freq = 0.25) {
  const p = x * freq,
    i = Math.floor(p),
    f = p - i
  const at = (k: number) => (hash(`${seed}:${k}`) % 2000) / 1000 - 1
  const s = f * f * (3 - 2 * f)
  return at(i) * (1 - s) + at(i + 1) * s
}
