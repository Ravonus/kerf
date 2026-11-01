// Dithering is the depth. Every inside cell gets a depth from how far it sits between the lit edge and the
// shadow edge of that form, so tone follows the object instead of filling it. Light is top left. The ramp snaps to cells:
// clear, checker, solid. Hand clusters override it: ^ stays clear, % stays solid.
import { pixel } from './draw.mjs'
import { enclosed, interior, rasterize } from './raster.mjs'

const SIZE = 16
export function master(text) {
  const rows = text.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n').map(r => r.trim())
  const g = rows.map(r => r.padEnd(SIZE, '.').slice(0, SIZE).split(''))
  while (g.length < SIZE) g.push(Array(SIZE).fill('.'))
  return g
}

/** A hand bitmap as a master: its biggest connected ink is the edge, ink walled inside it is the mark, its shade is a cluster. */
export function fromHand(art, name, spec) {
  const src = pixel(art, name).grid, seen = src.map(r => r.map(() => 0))
  let id = 0, best = 0, bestId = 0
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (src[y][x] !== '#' || seen[y][x]) continue
    id++; let n = 0; const stack = [[x, y]]
    while (stack.length) {
      const [a, b] = stack.pop()
      if (src[b]?.[a] !== '#' || seen[b][a]) continue
      seen[b][a] = id; n++
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) stack.push([a + i, b + j])
    }
    if (n > best) { best = n; bestId = id }
  }
  const edge = src.map((r, y) => r.map((c, x) => (seen[y][x] === bestId ? '#' : '.')))
  const inner = interior(edge)
  const hasBody = inner.flat().filter(Boolean).length >= 6
  return src.map((r, y) => r.map((c, x) => {
    if (seen[y][x] === bestId) return hasBody ? '#' : 'w'
    if (c === '#') return 'w'
    if (!inner[y][x]) return '.'
    return c === '+' ? '%' : ':'
  }))
}

/** The same legend from an outline spec, for the icons with no hand master. */
export function auto(spec) {
  const r = rasterize(spec), inner = enclosed(r.body)
  const g = r.grid.map((row, y) => row.map((c, x) => (r.weft[y][x] === '#' ? 'w' : c === '#' ? '#' : inner[y][x] ? ':' : '.')))
  const at = (x, y) => g[y]?.[x]
  // clusters by distance from the lit corner: stepped, because a band that follows the edge exactly is what looks filled
  const inside = g.flatMap((row, y) => row.flatMap((c, x) => (c === ':' ? [[x, y]] : [])))
  const span = inside.map(([x, y]) => x + y), lo = Math.min(...span), hi = Math.max(...span), size = hi - lo
  if (inside.length > 5) for (const [x, y] of inside) {
    const t = (x + y - lo) / size
    const edge = at(x + 1, y) === '#' || at(x, y + 1) === '#' || at(x + 2, y) === '#' || at(x, y + 2) === '#'
    if (t > .8 && edge) g[y][x] = '%'
    else if (t < .14) g[y][x] = '^'
  }
  return g
}

const each = (g, f) => g.map((r, y) => r.map((c, x) => f(c, x, y)))
const near = (g, x, y, ...want) => [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([i, j]) => want.includes(g[y + j]?.[x + i]))
const INSIDE = ':^%'
const checker = (x, y) => (x + y) % 2 === 0



/** 0 at the lit edge of a form, 1 at its shadow edge, measured along the light. */
export function depth(g, x, y) {
  const walk = (i, j) => { let k = 1; while (INSIDE.includes(g[y + j * k]?.[x + i * k] ?? '.') && g[y + j * k]?.[x + i * k] !== undefined) k++; return k }
  const lit = walk(-1, -1) + walk(-1, 0) + walk(0, -1), dark = walk(1, 1) + walk(1, 0) + walk(0, 1)
  return (lit - 1) / (lit + dark - 2 || 1)
}
const tone = (g, x, y, c) => (c === '^' ? 0 : c === '%' ? 1 : depth(g, x, y))
const halo = (g, x, y) => near(g, x, y, 'w')

/** No inside to shade: an arrow, a check. */
export const open = g => { const f = g.flat(), inner = f.filter(c => INSIDE.includes(c)).length; return inner < 6 || inner < 1.25 * f.filter(c => c === '#' || c === 'w').length }
/** A busy mark has no room for a shadow: at 16 px it turns to mud. */
const sparse = g => g.flat().filter(c => c === '#' || c === 'w').length < 52
const drop = (g, x, y) => { const on = (a, b) => g[b]?.[a] === 'w' || g[b]?.[a] === '#'; return !on(x, y) && (on(x - 1, y - 1) || on(x - 2, y - 2)) && checker(x, y) }

/** Hollow in pixels: the edge and the mark, the shadow side shaded. An open mark throws a dithered shadow. */
export const hollow = (g, openMark) => each(g, (c, x, y) => {
  if (c === '#' || c === 'w') return c
  if (openMark) return sparse(g) && drop(g, x, y) ? '#' : '.'
  if (!INSIDE.includes(c) || halo(g, x, y)) return '.'
  const t = tone(g, x, y, c)
  return t > .86 ? '#' : t > .6 && checker(x, y) ? '#' : '.'
})

const walled = (g, x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([i, j]) => { for (let k = 1; k < 16; k++) { const c = g[y + j * k]?.[x + i * k]; if (c === undefined) return false; if (c === '#') return true } return false })

/** Solid in pixels: a mass of ink, the lit side breaking into clear, the mark cut through. */
export const solid = g => each(g, (c, x, y) => {
  if (c === '.' || c === 'n' || (y && g[y - 1][x] === 'n')) return '.'
  if (c === 'w') return walled(g, x, y) ? '.' : 'w'
  if (c === '#') return '#'
  const t = tone(g, x, y, c)
  return t > .24 ? '#' : t > .1 && checker(x, y) ? '#' : '.'
})

/** An open mark in solid: a stepped pixel badge with the notch cut, the lit corner breaking up, and the mark cut through. */
export const block = g => each(g, (c, x, y) => {
  const on = (a, b) => g[b]?.[a] === 'w' || g[b]?.[a] === '#'
  const edge = Math.min(x, y, 15 - x, 15 - y), corner = (x === 0 || x === 15) && (y === 0 || y === 15)
  if (corner || (y === 0 && x === 3)) return '.'
  if (on(x, y)) return '.'
  if (edge > 0 && x + y < 8 && !near(g, x, y, 'w', '#') && (x + y < 5 || checker(x, y))) return '.'
  return '#'
})

/** The balanced hollow's depth: checker on the shadow side, in one body. Loose cells read as dirt at 16 px, so a cell has to
 *  join others on the diagonal, and a crescent too small to read as shade is left out. */
export function crescent(g) {
  const raw = each(g, (c, x, y) => (INSIDE.includes(c) && !halo(g, x, y) && tone(g, x, y, c) > .62 && checker(x, y) ? '#' : '.'))
  const ties = (x, y) => [[1, 1], [-1, 1], [1, -1], [-1, -1]].filter(([i, j]) => raw[y + j]?.[x + i] === '#').length
  const kept = each(raw, (c, x, y) => (c === '#' && ties(x, y) >= 1 ? '#' : '.'))
  return kept.flat().filter(c => c === '#').length >= 6 ? kept : each(raw, () => '.')
}

/** Cells to knock out of a balanced solid, breaking up the lit side. A badge takes a fixed corner. */
export const litCells = g => (g === 0
  ? Array.from({ length: 16 }, (_, y) => Array.from({ length: 16 }, (_, x) => (x + y < 7 && x > 1 && y > 1 && checker(x, y) ? '#' : '.')))
  : each(g, (c, x, y) => { if (!INSIDE.includes(c) || halo(g, x, y)) return '.'; const t = tone(g, x, y, c); return t < .16 || (t < .36 && checker(x, y)) ? '#' : '.' }))
