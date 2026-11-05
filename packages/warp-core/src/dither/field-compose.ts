import { reducedMotion } from '../motion'
import type { FieldOptions } from './field'
import type { Mask } from './mask'
import type { Forces } from './pointer'
import type { Tier } from './ramp'
import type { tile } from './tiles'

const HOT = 0.32
const clamp = (v: number, hi: number) => (v < 0 ? 0 : v > hi ? hi : v)

export function composeField(
  now: number,
  stirred: boolean,
  o: FieldOptions,
  dials: Tier,
  mask: Mask | undefined,
  push: Forces | undefined,
  ground: Float32Array | undefined,
  moves: () => boolean,
  host: HTMLElement,
  rows: number,
  cols: number,
  tones: Float32Array,
  shown: Float32Array,
  heat: Float32Array,
) {
  const gain = o.gain ?? dials.gain,
    m = mask,
    p = stirred ? push : undefined,
    g = ground,
    sweep = moves() && !reducedMotion(host) ? (o.reveal ?? 0) : 0
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
      let v = tone * tone * 0.95 * gain * (g ? g[i]! : 1) + energy * 0.55
      if (m) {
        const age = sweep ? now - (x / cols) * sweep : 1
        const on = age <= 0 ? 0 : age >= 0.2 ? 1 : age * 5,
          flash = age > 0 && age < 0.3 ? (0.3 - age) * 2 * m.shape[at]! : 0
        v =
          v * 0.42 +
          m.halo[at]! * 0.34 * gain * on +
          m.shape[at]! * (0.46 + tone * 0.72) * on +
          flash
      }
      shown[i] = v
      heat[i] = energy
      if (energy > HOT) hot = true
    }
  return hot
}

/** Disturbed cells take the spark inks at the level they already dithered to. */
export function igniteField(
  inks: Uint32Array,
  pattern: ReturnType<typeof tile>,
  spreadValue: number | undefined,
  rows: number,
  cols: number,
  heat: Float32Array,
  shown: Float32Array,
  out: Uint32Array,
  sparks: Uint32Array,
) {
  const top = inks.length - 1,
    n = pattern.n,
    bits = n - 1,
    spread = spreadValue ?? 0.9,
    shift = (1 - spread) / 2
  for (let y = 0, i = 0; y < rows; y++)
    for (let x = 0; x < cols; x++, i++)
      if (heat[i]! > HOT) {
        const level = shown[i]! * top + pattern.t[(y & bits) * n + (x & bits)]! * spread + shift
        if (level >= 1) out[i] = sparks[Math.min(sparks.length - 1, (level | 0) + 1)]!
      }
}
