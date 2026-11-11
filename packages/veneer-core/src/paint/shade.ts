// A shader turns a point's place across its shape (u, v in −1 to 1) into a tone; one light per picture.

/** A point's place across its shape, u left to right and v top to bottom, to a tone in 0 to 1. */
export type Shader = (u: number, v: number, x: number, y: number) => number

const clamp = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

/** Shaders lit from one direction (a unit-ish vector; y runs down, z toward the viewer). */
export function light(lx: number, ly: number, lz: number) {
  const lit = (nx: number, ny: number, nz: number) =>
    clamp(0.2 + 0.8 * (nx * lx + ny * ly + nz * lz))
  return {
    /** A ball. */
    sphere: ((u, v) => lit(u, v, Math.sqrt(Math.max(0, 1 - u * u - v * v)))) as Shader,
    /** An upright cylinder: lit across, flat down. */
    cylinder: ((u) => lit(u * 0.95, -0.15, Math.sqrt(Math.max(0, 1 - u * u)))) as Shader,
  }
}

/** The default light: up and to the left, a little toward the viewer. */
export const { sphere, cylinder } = light(-0.52, -0.68, 0.52)

/** A surface seen from above at an angle: brightest toward the back left. */
export const surface: Shader = (u, v) => clamp(0.62 - 0.22 * u - 0.18 * v)

/** One tone all over. */
export const flat =
  (t: number): Shader =>
  () =>
    t
