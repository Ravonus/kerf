// Pointer play on a spring lattice laid over the cells (the site's loom): each node springs home, leans on its neighbours so
// a push travels, and loses a little. `ripple` stirs it along the pointer's path, `pull` drags the threads it crosses and
// lets them spring back, and `shockwave` kicks a ring out from a press. Once it settles it costs nothing.
/** How the pointer disturbs a field. */
export type PointerMode = 'ripple' | 'pull' | 'shockwave'

/** The pointer's pull on a field: input goes in, and each cell's displacement and energy come out. */
export interface Forces {
  move(x: number, y: number): void
  leave(): void
  press(x: number, y: number): void
  /** Advance by `dt` seconds: true while anything is still moving. */
  step(dt: number): boolean
  /** The displacement and energy at a cell, into `ox`, `oy` and `energy`. */
  at(x: number, y: number): void
  ox: number
  oy: number
  energy: number
}

const TICK = 1 / 40
const clip = (v: number) => Math.max(-3, Math.min(3, v))

type Lattice = [Float32Array, Float32Array, Float32Array, Float32Array]

function tick(nx: number, ny: number, [ux, uy, vx, vy]: Lattice) {
  const size = nx * ny
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
  for (let i = 0; i < size; i++) {
    ux[i]! += vx[i]!
    uy[i]! += vy[i]!
    peak = Math.max(peak, Math.abs(ux[i]!), Math.abs(uy[i]!), Math.abs(vx[i]!), Math.abs(vy[i]!))
  }
  return peak > 0.02
}

type Visit = (
  px: number,
  py: number,
  r: number,
  fn: (i: number, dx: number, dy: number, d: number) => void,
) => void

function visit(
  px: number,
  py: number,
  r: number,
  [GAP, nx, ny]: [number, number, number],
  fn: (i: number, dx: number, dy: number, d: number) => void,
) {
  const n = Math.ceil(r / GAP),
    cx = Math.round(px / GAP),
    cy = Math.round(py / GAP)
  for (let y = Math.max(1, cy - n); y <= Math.min(ny - 2, cy + n); y++)
    for (let x = Math.max(1, cx - n); x <= Math.min(nx - 2, cx + n); x++) {
      const dx = x * GAP - px,
        dy = y * GAP - py
      fn(y * nx + x, dx, dy, Math.hypot(dx, dy))
    }
}

function makeKick(around: Visit, power: number, scale: number, vx: Float32Array, vy: Float32Array) {
  return (px: number, py: number, r: number, wide: number, strength: number) =>
    around(px, py, r, (i, dx, dy, d) => {
      const f = Math.exp(-(d * d) / wide) * strength * power * scale,
        n = d || 1
      vx[i]! += (dx / n) * f
      vy[i]! += (dy / n) * f
    })
}

/** `power` 0–1 scales every push. The lattice's gap follows the grid, so a push looks alike at any cell size. */
export function forces(modes: PointerMode[], cols: number, rows: number, power = 1): Forces {
  const ripple = modes.includes('ripple'),
    pulls = modes.includes('pull'),
    shocks = modes.includes('shockwave')
  const GAP = Math.max(3, Math.round(Math.min(cols, rows) / 20)),
    scale = GAP / 5
  const nx = Math.ceil(cols / GAP) + 2,
    ny = Math.ceil(rows / GAP) + 2,
    size = nx * ny
  const ux = new Float32Array(size),
    uy = new Float32Array(size),
    vx = new Float32Array(size),
    vy = new Float32Array(size),
    grid: [number, number, number] = [GAP, nx, ny],
    lattice: Lattice = [ux, uy, vx, vy]
  let moving = false,
    due = 0,
    lx = -1,
    ly = -1

  const around: Visit = (px, py, r, fn) => {
    visit(px, py, r, grid, fn)
    moving = true
  }
  const kick = makeKick(around, power, scale, vx, vy)

  const self: Forces = {
    ox: 0,
    oy: 0,
    energy: 0,
    move(x, y) {
      const mx = lx < 0 ? 0 : clip(x - lx),
        my = lx < 0 ? 0 : clip(y - ly)
      lx = x
      ly = y
      if (pulls)
        around(x, y, 30 * scale, (i, dx, dy, d) => {
          const f = Math.exp(-(d * d) / (180 * scale * scale)) * power
          vx[i]! += (mx * 0.42 - (dx * 0.018) / scale) * f
          vy[i]! += (my * 0.42 - (dy * 0.018) / scale) * f
        })
      if (ripple && (mx || my)) kick(x, y, 16 * scale, 60 * scale * scale, Math.hypot(mx, my) * 0.3)
    },
    leave() {
      lx = -1
    },
    press(x, y) {
      if (shocks) kick(x, y, 22 * scale, 120 * scale * scale, 2.6)
    },
    step(dt) {
      if (!moving) return false
      due = Math.min(due + dt, TICK * 3)
      for (; due >= TICK; due -= TICK) moving = tick(nx, ny, lattice)
      return moving
    },
    at(x, y) {
      if (!moving) {
        self.ox = self.oy = self.energy = 0
        return
      }
      const gx = x / GAP,
        gy = y / GAP,
        ix = gx | 0,
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
      self.ox = -dx
      self.oy = -dy
      self.energy = Math.min(1, (Math.hypot(dx, dy) * 0.07) / scale)
    },
  }
  return self
}
