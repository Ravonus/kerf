export const GAP = 5

export type Lattice = {
  nx: number
  ny: number
  ux: Float32Array
  uy: Float32Array
  vx: Float32Array
  vy: Float32Array
}

export function lattice(cols: number, rows: number): Lattice {
  const nx = Math.ceil(cols / GAP) + 2,
    ny = Math.ceil(rows / GAP) + 2
  const grid = () => new Float32Array(nx * ny)
  return { nx, ny, ux: grid(), uy: grid(), vx: grid(), vy: grid() }
}

/** One tick of the lattice: each node springs home, leans on its neighbours (so a push travels), and loses a little. */
export function stepLattice({ nx, ny, ux, uy, vx, vy }: Lattice) {
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
  return peak > 0.02
}

function around(
  { nx, ny }: Lattice,
  at: { x: number; y: number; r: number },
  fn: (i: number, dx: number, dy: number, d: number) => void,
) {
  const n = Math.ceil(at.r / GAP)
  const cx = Math.round(at.x / GAP),
    cy = Math.round(at.y / GAP)
  for (let y = Math.max(1, cy - n); y <= Math.min(ny - 2, cy + n); y++)
    for (let x = Math.max(1, cx - n); x <= Math.min(nx - 2, cx + n); x++) {
      const dx = x * GAP - at.x,
        dy = y * GAP - at.y
      fn(y * nx + x, dx, dy, Math.hypot(dx, dy))
    }
}

/** The pointer drags the threads it crosses and draws them toward it; the springs take them back. */
export function pullLattice(l: Lattice, px: number, py: number, mx: number, my: number) {
  around(l, { x: px, y: py, r: 30 }, (i, dx, dy, d) => {
    const f = Math.exp(-(d * d) / 180)
    l.vx[i]! += (mx * 0.42 - dx * 0.018) * f
    l.vy[i]! += (my * 0.42 - dy * 0.018) * f
  })
}

/** A press kicks every nearby node outward; the lattice carries it across the field as a ring. */
export function shockLattice(l: Lattice, px: number, py: number) {
  around(l, { x: px, y: py, r: 22 }, (i, dx, dy, d) => {
    const f = Math.exp(-(d * d) / 120) * 2.6
    const n = d || 1
    l.vx[i]! += (dx / n) * f
    l.vy[i]! += (dy / n) * f
  })
}

export function displace({ nx, ux, uy }: Lattice, x: number, y: number): [number, number] {
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
  const mix = (u: Float32Array) =>
    (u[a]! * (1 - fx) + u[b]! * fx) * (1 - fy) + (u[c]! * (1 - fx) + u[d]! * fx) * fy
  return [mix(ux), mix(uy)]
}
