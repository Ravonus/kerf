// Colours packed as ImageData stores them (0xAABBGGRR); a ramp is a shading scale of them, darkest first.

/** A shading scale, darkest first. Five steps is the usual size. */
export type Ramp = readonly number[]

/** r, g, b and alpha in 0 to 255, packed. */
export const pack = (r: number, g: number, b: number, a = 255) =>
  ((a << 24) | (b << 16) | (g << 8) | r) >>> 0

/** A `#rrggbb` colour, packed, at an alpha in 0 to 1. */
export function hex(h: string, a = 1) {
  const n = Number.parseInt(h.slice(1), 16)
  return pack(n >> 16, (n >> 8) & 255, n & 255, Math.round(a * 255))
}

/** A ramp from `#rrggbb` colours, darkest first. */
export const ramp = (...cols: string[]): Ramp => cols.map((c) => hex(c))

/** A glass or vapour ramp: one colour at rising alphas, the faintest first. */
export const glass = (c: string, ...a: number[]): Ramp => a.map((x) => hex(c, x))

/** The colour at another alpha. */
export const alpha = (c: number, a: number) =>
  ((c & 0x00ffffff) | (Math.round(a * 255) << 24)) >>> 0

/** The colour with each channel scaled by `k` (below 1 darkens). */
export const darken = (c: number, k: number) =>
  pack(
    Math.round((c & 255) * k),
    Math.round(((c >> 8) & 255) * k),
    Math.round(((c >> 16) & 255) * k),
    c >>> 24,
  )

/** `top` over `base` at `a`, opaque. */
export function mix(base: number, top: number, a: number) {
  const ch = (s: number) => Math.round(((base >> s) & 255) * (1 - a) + ((top >> s) & 255) * a)
  return pack(ch(0), ch(8), ch(16))
}
