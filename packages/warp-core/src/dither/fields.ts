// Fields: a pure function from a place and a time to a tone, so a poster and the running canvas are the same picture.
// `x` runs 0 to the aspect ratio, `y` 0–1, `t` is seconds. The fields are smooth, so big canvases evaluate them on a sparse
// lattice and interpolate: the sines cost a sixteenth at most, and the dither still lands on every cell.
/** A scalar field: a tone at a point and a time. */
export type Field = (x: number, y: number, t: number) => number
/** The name of a built-in field. */
export type FieldName = 'weave' | 'flow' | 'rings' | 'aurora' | 'drift'

const { sin, cos, exp, hypot, min, max } = Math

/** The built-in fields. */
export const FIELDS: Record<FieldName, Field> = {
  /** The loom: long crossing swells, the site's hero. */
  weave(x: number, y: number, t: number) {
    const u = x * 4.4,
      v = y * 4.4
    return (
      (sin(u * 0.9 + t * 0.35) * 0.5 +
        sin(v * 1.7 - t * 0.25 + sin(u * 0.6 + t * 0.15) * 1.4) * 0.5 +
        sin((u + v) * 2.3 + t * 0.5) * 0.22 +
        1.22) /
      2.44
    )
  },
  /** Contour bands bent by a slow domain Warp. */
  flow(x: number, y: number, t: number) {
    const a = x * 2.2 + sin(y * 3.1 + t * 0.2) * 0.8,
      b = y * 2.2 + cos(x * 2.7 - t * 0.17) * 0.8
    return (
      (sin(a * 1.9 + cos(b * 1.6 + t * 0.13) * 2.1) + sin(b * 2.3 - a * 0.7 + t * 0.21)) / 4 + 0.5
    )
  },
  /** Rings from two drifting centres. */
  rings(x: number, y: number, t: number) {
    const a = hypot(x - 0.42 - sin(t * 0.13) * 0.2, y - 0.5 - cos(t * 0.11) * 0.2),
      b = hypot(x - 1.2 - cos(t * 0.09) * 0.2, y - 0.56 - sin(t * 0.14) * 0.2)
    return min(
      1,
      max(
        0,
        (sin(a * 15 - t * 0.9) * exp(-a * 1.3) + sin(b * 12 - t * 0.7) * exp(-b * 1.5)) * 0.42 +
          0.46,
      ),
    )
  },
  /** Curtains that hang from the top and fade toward the bottom. */
  aurora(x: number, y: number, t: number) {
    const fold = sin(x * 3.1 + t * 0.21 + sin(x * 7.3 - t * 0.13) * 0.5) * 0.14
    const band = exp(-((y - 0.4 - fold) ** 2) * 5),
      rays = 0.86 + 0.14 * sin(x * 34 + sin(x * 5 + t * 0.3) * 4 + t * 0.4)
    return band * rays
  },
  /** Soft bodies that drift past and merge. */
  drift(x: number, y: number, t: number) {
    let e = 0
    for (let i = 0; i < 5; i++) {
      const px = 0.8 + sin(t * (0.11 + i * 0.03) + i * 2.4) * 0.72,
        py = 0.5 + cos(t * (0.09 + i * 0.02) + i * 1.7) * 0.4,
        dx = x - px,
        dy = y - py
      e += 0.05 / (dx * dx + dy * dy + 0.05)
    }
    return 1 - exp(-e * 1.1)
  },
}

/** The field across a grid, into `out`. `step` > 1 interpolates between lattice points. */
export function sample(
  field: Field,
  cols: number,
  rows: number,
  t: number,
  out: Float32Array,
  step = 1,
) {
  const unit = 1 / rows
  if (step === 1) {
    for (let y = 0, i = 0; y < rows; y++)
      for (let x = 0; x < cols; x++, i++) out[i] = field(x * unit, y * unit, t)
    return out
  }
  const lw = Math.ceil(cols / step) + 2,
    lh = Math.ceil(rows / step) + 2,
    lattice = new Float32Array(lw * lh)
  for (let y = 0, i = 0; y < lh; y++)
    for (let x = 0; x < lw; x++, i++) lattice[i] = field(x * step * unit, y * step * unit, t)
  const k = 1 / step
  for (let y = 0, i = 0; y < rows; y++) {
    const gy = (y * k) | 0,
      fy = y * k - gy,
      top = gy * lw
    for (let x = 0; x < cols; x++, i++) {
      const gx = (x * k) | 0,
        fx = x * k - gx,
        a = lattice[top + gx]!,
        b = lattice[top + gx + 1]!,
        c = lattice[top + lw + gx]!,
        d = lattice[top + lw + gx + 1]!
      out[i] = a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy
    }
  }
  return out
}

/** A lattice step that keeps the field near 8,000 evaluations. */
export const stepFor = (cells: number) =>
  Math.max(1, Math.min(4, Math.round(Math.sqrt(cells / 8000))))
