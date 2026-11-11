import type { FieldState } from './field-state'

const HOT = 0.32
const clamp = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v)

export function composeField(now: number, stirred: boolean, v: FieldState, sweeps: boolean) {
  const { o, rows, cols, tones, shown, heat } = v,
    gain = o.gain ?? v.dials.gain,
    m = v.mask,
    p = stirred ? v.push : undefined,
    g = v.ground,
    sweep = sweeps ? (o.reveal ?? 0) : 0
  let hot = false
  for (let y = 0, i = 0; y < rows; y++)
    for (let x = 0; x < cols; x++, i++) {
      let at = i,
        energy = 0
      if (p) {
        p.at(x, y)
        energy = p.energy
        if (energy)
          at = clamp(Math.round(y + p.oy), rows - 1) * cols + clamp(Math.round(x + p.ox), cols - 1)
      }
      const tone = tones[at]!
      let val = tone * tone * 0.95 * gain * (g ? g[i]! : 1) + energy * 0.55
      if (m) {
        const age = sweep ? now - (x / cols) * sweep : 1
        const on = age <= 0 ? 0 : age >= 0.2 ? 1 : age * 5,
          flash = age > 0 && age < 0.3 ? (0.3 - age) * 2 * m.shape[at]! : 0
        val =
          val * 0.42 +
          m.halo[at]! * 0.34 * gain * on +
          m.shape[at]! * (0.46 + tone * 0.72) * on +
          flash
      }
      shown[i] = val
      heat[i] = energy
      if (energy > HOT) hot = true
    }
  return hot
}

/** Disturbed cells take the spark inks at the level they already dithered to. */
export function igniteField(v: FieldState, sparks: Uint32Array) {
  const { inks, pattern, rows, cols, heat, shown, out } = v,
    top = inks.length - 1,
    n = pattern.n,
    bits = n - 1,
    spread = v.o.spread ?? 0.9,
    shift = (1 - spread) / 2
  for (let y = 0, i = 0; y < rows; y++)
    for (let x = 0; x < cols; x++, i++)
      if (heat[i]! > HOT) {
        const level = shown[i]! * top + pattern.t[(y & bits) * n + (x & bits)]! * spread + shift
        if (level >= 1) out[i] = sparks[Math.min(sparks.length - 1, (level | 0) + 1)]!
      }
}
