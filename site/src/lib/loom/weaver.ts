// The loom's engine: no framework and no DOM. A word and a logo as coverage masks, a spring lattice laid over them, and
// one function from a cell to a palette index. A caller decides how a cell reaches the screen. Liftable as it stands.
import { level, PALETTE } from '../field'
import { displace, lattice, pullLattice, shockLattice, stepLattice, type Lattice } from './lattice'
import type { Threads } from './threads'

const STEPS = PALETTE.length

type Scene = {
  cols: number
  rows: number
  word: Float32Array | null
  logo: Threads
  lat: Lattice
  moving: boolean
}

function bandOf(scene: Scene, i: number, energy: number, thread: number) {
  const { word, logo } = scene
  if (word && word[i]! > 0.5 && energy < 0.14) return 0
  return energy > 0.34 ? 2 : energy > 0.14 ? 1 : thread > 0.5 ? logo.band[i]! : 0
}

/** Palette index of cell (x, y). `t` drives the slow field, `clock` is seconds since the logo began. */
function cellAt(scene: Scene, x: number, y: number, t: number, clock: number) {
  const { cols, rows, word, logo } = scene
  let sx = x,
    sy = y,
    energy = 0
  if (scene.moving) {
    const [dx, dy] = displace(scene.lat, x, y)
    energy = Math.min(1, Math.hypot(dx, dy) * 0.09)
    sx = Math.max(0, Math.min(cols - 1, Math.round(x - dx)))
    sy = Math.max(0, Math.min(rows - 1, Math.round(y - dy)))
  }
  const i = sy * cols + sx
  const age = clock - logo.born[i]!
  const thread = age > 0 ? logo.cover[i]! * Math.min(1, age * 5) : 0
  const flash = age > 0 && age < 0.35 ? (0.35 - age) * 1.6 * logo.cover[i]! : 0
  // The shed: alternate threads rise as a slow wave crosses the cloth.
  const shed = ((x >> 1) ^ (y >> 1)) & 1 ? Math.sin(x * 0.07 + y * 0.045 - t * 2.4) * 0.09 : 0
  const lift = (word ? word[i]! * 0.98 : 0) + thread * 0.5 + flash + energy * 0.8 + shed
  let band = bandOf(scene, i, energy, thread)
  const inWord = word && word[i]! > 0.5 && energy < 0.14
  if (!band && !inWord && Math.sin((x / cols) * 3.1 + (y / rows) * 1.7 - t * 0.5) > 0.86) band = 1
  return level({ x, y, cols, rows, t, lift }) + band * STEPS
}

export function weaver(cols: number, rows: number, word: Float32Array | null, logo: Threads) {
  const scene: Scene = { cols, rows, word, logo, lat: lattice(cols, rows), moving: false }
  const step = () => {
    scene.moving = stepLattice(scene.lat)
  }
  const pull = (px: number, py: number, mx: number, my: number) => {
    pullLattice(scene.lat, px, py, mx, my)
    scene.moving = true
  }
  const shock = (px: number, py: number) => {
    shockLattice(scene.lat, px, py)
    scene.moving = true
  }
  const at = (x: number, y: number, t: number, clock: number) => cellAt(scene, x, y, t, clock)
  return { step, pull, shock, at, moving: () => scene.moving }
}
