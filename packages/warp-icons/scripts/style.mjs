// Dithering is the depth. Every inside cell gets a depth from how far it sits between the lit edge and the
// shadow edge of that form, so tone follows the object instead of filling it. Light is top left. The ramp snaps to cells:
// clear, checker, solid. Hand clusters override it: ^ stays clear, % stays solid.
import { pixel } from './draw.mjs'
import { interior, rasterize } from './raster.mjs'

const SIZE = 16
export function master(text) {
  const rows = text
    .replace(/^\s*\n/, '')
    .replace(/\s+$/, '')
    .split('\n')
    .map((r) => r.trim())
  const g = rows.map((r) => r.padEnd(SIZE, '.').slice(0, SIZE).split(''))
  while (g.length < SIZE) g.push(Array(SIZE).fill('.'))
  return g
}

/** A hand bitmap as a master: its biggest connected ink is the edge, ink walled inside it is the mark, its shade is a cluster. */
export function fromHand(art, name) {
  const src = pixel(art, name).grid,
    seen = src.map((r) => r.map(() => 0))
  let id = 0,
    best = 0,
    bestId = 0
  for (let y = 0; y < SIZE; y++)
    for (let x = 0; x < SIZE; x++) {
      if (src[y][x] !== '#' || seen[y][x]) continue
      id++
      let n = 0
      const stack = [[x, y]]
      while (stack.length) {
        const [a, b] = stack.pop()
        if (src[b]?.[a] !== '#' || seen[b][a]) continue
        seen[b][a] = id
        n++
        for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) stack.push([a + i, b + j])
      }
      if (n > best) {
        best = n
        bestId = id
      }
    }
  const edge = src.map((r, y) => r.map((c, x) => (seen[y][x] === bestId ? '#' : '.')))
  const inner = interior(edge)
  const hasBody = inner.flat().filter(Boolean).length >= 6
  return src.map((r, y) =>
    r.map((c, x) => {
      if (seen[y][x] === bestId) return hasBody ? '#' : 'w'
      if (c === '#') return 'w'
      if (!inner[y][x]) return '.'
      return c === '+' ? '%' : ':'
    }),
  )
}

/** The same legend from an outline spec, for the icons with no hand master. */
export function auto(spec) {
  const r = rasterize(spec),
    inner = interior(r.body)
  const g = r.grid.map((row, y) =>
    row.map((c, x) => (r.weft[y][x] === '#' ? 'w' : c === '#' ? '#' : inner[y][x] ? ':' : '.')),
  )
  const at = (x, y) => g[y]?.[x]
  // clusters by distance from the lit corner: stepped, because a band that follows the edge exactly is what looks filled
  const inside = g.flatMap((row, y) => row.flatMap((c, x) => (c === ':' ? [[x, y]] : [])))
  const span = inside.map(([x, y]) => x + y),
    lo = Math.min(...span),
    hi = Math.max(...span),
    size = hi - lo
  if (inside.length > 5)
    for (const [x, y] of inside) {
      const t = (x + y - lo) / size
      const edge =
        at(x + 1, y) === '#' || at(x, y + 1) === '#' || at(x + 2, y) === '#' || at(x, y + 2) === '#'
      if (t > 0.8 && edge) g[y][x] = '%'
      else if (t < 0.14) g[y][x] = '^'
    }
  return g
}

const each = (g, f) => g.map((r, y) => r.map((c, x) => f(c, x, y)))
const near = (g, x, y, ...want) =>
  [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].some(([i, j]) => want.includes(g[y + j]?.[x + i]))
const INSIDE = ':^%'
const checker = (x, y) => (x + y) % 2 === 0

/** 0 at the lit edge of a form, 1 at its shadow edge, measured along the light. */
export function depth(g, x, y) {
  const walk = (i, j) => {
    let k = 1
    while (
      INSIDE.includes(g[y + j * k]?.[x + i * k] ?? '.') &&
      g[y + j * k]?.[x + i * k] !== undefined
    )
      k++
    return k
  }
  const lit = walk(-1, -1) + walk(-1, 0) + walk(0, -1),
    dark = walk(1, 1) + walk(1, 0) + walk(0, 1)
  return (lit - 1) / (lit + dark - 2 || 1)
}
const tone = (g, x, y, c) => (c === '^' ? 0 : c === '%' ? 1 : depth(g, x, y))
const halo = (g, x, y) => near(g, x, y, 'w')

/** No inside to shade: an arrow, a check. */
export const open = (g) => {
  const f = g.flat(),
    inner = f.filter((c) => INSIDE.includes(c)).length
  return inner < 6 || inner < 1.25 * f.filter((c) => c === '#' || c === 'w').length
}
/** A busy mark has no room for a shadow: at 16 px it turns to mud. */
const sparse = (g) => g.flat().filter((c) => c === '#' || c === 'w').length < 52
const drop = (g, x, y) => {
  const on = (a, b) => g[b]?.[a] === 'w' || g[b]?.[a] === '#'
  return !on(x, y) && (on(x - 1, y - 1) || on(x - 2, y - 2)) && checker(x, y)
}

/** Hollow in pixels: the edge and the mark, the shadow side shaded. An open mark throws a dithered shadow. */
export const hollow = (g, openMark, dither = '#') =>
  each(g, (c, x, y) => {
    if (c === '#' || c === 'w') return c
    if (openMark) return sparse(g) && drop(g, x, y) ? dither : '.'
    if (!INSIDE.includes(c) || halo(g, x, y)) return '.'
    const t = tone(g, x, y, c)
    return t > 0.86 ? '#' : t > 0.6 && checker(x, y) ? dither : '.'
  })

const walled = (g, x, y) =>
  [
    [1, 0],
    [-1, 0],
    [0, 1],
    [0, -1],
  ].every(([i, j]) => {
    for (let k = 1; k < 16; k++) {
      const c = g[y + j * k]?.[x + i * k]
      if (c === undefined) return false
      if (c === '#') return true
    }
    return false
  })

/** Solid in pixels: a mass of ink, the lit side breaking into clear, the mark cut through. */
export const solid = (g) =>
  each(g, (c, x, y) => {
    if (c === '.' || c === 'n' || (y && g[y - 1][x] === 'n')) return '.'
    if (c === 'w') return walled(g, x, y) ? '.' : 'w'
    if (c === '#') return '#'
    const t = tone(g, x, y, c)
    return t > 0.24 ? '#' : t > 0.1 && checker(x, y) ? '#' : '.'
  })

/** An open mark in solid: a stepped pixel badge with the notch cut, the lit corner breaking up, and the mark cut through. */
export const block = (g) =>
  each(g, (c, x, y) => {
    const on = (a, b) => g[b]?.[a] === 'w' || g[b]?.[a] === '#'
    const edge = Math.min(x, y, 15 - x, 15 - y),
      corner = (x === 0 || x === 15) && (y === 0 || y === 15)
    if (corner || (y === 0 && x === 3)) return '.'
    if (on(x, y)) return '.'
    if (edge > 0 && x + y < 8 && !near(g, x, y, 'w', '#') && (x + y < 5 || checker(x, y)))
      return '.'
    return '#'
  })

/** The balanced hollow's depth: checker on the shadow side, in one body. Loose cells read as dirt at 16 px, so a cell has to
 *  join others on the diagonal, and a crescent too small to read as shade is left out. */
export function crescent(g) {
  const raw = each(g, (c, x, y) =>
    INSIDE.includes(c) && !halo(g, x, y) && tone(g, x, y, c) > 0.62 && checker(x, y) ? '#' : '.',
  )
  const ties = (x, y) =>
    [
      [1, 1],
      [-1, 1],
      [1, -1],
      [-1, -1],
    ].filter(([i, j]) => raw[y + j]?.[x + i] === '#').length
  const kept = each(raw, (c, x, y) => (c === '#' && ties(x, y) >= 1 ? '#' : '.'))
  return kept.flat().filter((c) => c === '#').length >= 6 ? kept : each(raw, () => '.')
}

/** Cells to knock out of a balanced solid, breaking up the lit side. A badge takes a fixed corner. */
export const litCells = (g) =>
  g === 0
    ? Array.from({ length: 16 }, (_, y) =>
        Array.from({ length: 16 }, (__, x) =>
          x + y < 7 && x > 1 && y > 1 && checker(x, y) ? '#' : '.',
        ),
      )
    : each(g, (c, x, y) => {
        if (!INSIDE.includes(c) || halo(g, x, y)) return '.'
        const t = tone(g, x, y, c)
        return t < 0.16 || (t < 0.36 && checker(x, y)) ? '#' : '.'
      })

/** Pieces of a grid: connected ink (any neighbour) and connected clear (side neighbours, the outside counting as one). */
function topology(grid) {
  // a clear ring round the grid, so all of the outside is one piece
  const on = [
    Array(18).fill(false),
    ...grid.map((r) => [false, ...r, false]),
    Array(18).fill(false),
  ]
  const seen = on.map((r) => r.map(() => false))
  const fill = (x0, y0, want, eight) => {
    const stack = [[x0, y0]]
    while (stack.length) {
      const [x, y] = stack.pop()
      if (x < 0 || y < 0 || x > 17 || y > 17 || seen[y][x] || on[y][x] !== want) continue
      seen[y][x] = true
      for (let i = -1; i <= 1; i++)
        for (let j = -1; j <= 1; j++)
          if ((i || j) && (eight || !i || !j)) stack.push([x + i, y + j])
    }
  }
  let ink = 0,
    clear = 0
  for (let y = 0; y < 18; y++)
    for (let x = 0; x < 18; x++) {
      if (seen[y][x]) continue
      if (on[y][x]) ink++
      else clear++
      fill(x, y, on[y][x], on[y][x])
    }
  return `${ink}:${clear}`
}

const SQUARE = [-1, 0, 1].flatMap((i) => [-1, 0, 1].map((j) => [i, j]))
const CORNER = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
]

/** An open mark in pixels, as an object: every stroke grown a cell each way. Solid is the grown shape; hollow is its rim,
 *  the stroke itself left clear down the middle. Where growing would run two parts together or close a gap (a menu's bars,
 *  a refresh arc's break), that cell stays clear, so a tight mark grows as far as it can. The weft stays weft. */
const SIDES = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
]
const isInk = (c) => c === '#' || c === 'w'
const shapeOf = (h) => topology(h.map((r) => r.map((c) => c !== '.')))
const BLOCK = [
  [0, 0],
  [1, 0],
  [0, 1],
  [1, 1],
]

/** The mark grown a cell, never running two parts together or closing a gap. Art drawn two cells wide, and every solid,
 *  grow a cell down and right only: three wide reads as filled, and a hollow's walls stay one cell round its core. */
function grow(g, form) {
  const lines = g.map((r) => r.map((c) => (isInk(c) ? c : '.')))
  const before = shapeOf(lines)
  const cells = lines.flat().filter((c) => c !== '.').length
  const blocky = lines
    .flatMap((r, y) =>
      r.map(
        (c, x) =>
          c !== '.' &&
          BLOCK.some(([i, j]) => BLOCK.every(([a, b]) => isInk(g[y - j + b]?.[x - i + a]))),
      ),
    )
    .filter(Boolean).length
  const by = form === 'solid' || blocky > 0.6 * cells ? CORNER : SQUARE
  const reach = (x, y) => {
    const from = by.map(([i, j]) => g[y - j]?.[x - i]).filter(isInk)
    return !from.length ? '.' : from.includes('w') ? 'w' : '#'
  }
  const grown = each(lines, (c, x, y) => (c !== '.' ? c : reach(x, y)))
  if (shapeOf(grown) === before) return grown
  const safe = lines.map((r) => r.slice())
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      const c = safe[y][x] === '.' ? reach(x, y) : '.'
      if (c === '.') continue
      safe[y][x] = c
      if (shapeOf(safe) !== before) safe[y][x] = '.'
    }
  return safe
}

/** A rim cell that only makes an elbow (a step on a diagonal, the corner of a turn) goes, the way a stepped frame drops its
 *  corner cell, so long as the rim keeps its pieces and its middle stays shut. A dot keeps its corners: without them it is
 *  a broken diamond. */
function smooth(rim, on) {
  const piece = (x0, y0) => {
    const seen = new Set(),
      stack = [[x0, y0]]
    while (stack.length) {
      const [x, y] = stack.pop()
      if (!on(x, y) || seen.has(`${x},${y}`)) continue
      seen.add(`${x},${y}`)
      for (const [i, j] of SQUARE) stack.push([x + i, y + j])
    }
    return seen.size
  }
  const keep = shapeOf(rim),
    at = (x, y) => rim[y]?.[x] !== undefined && rim[y][x] !== '.'
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!at(x, y)) continue
      const h = at(x - 1, y) || at(x + 1, y),
        v = at(x, y - 1) || at(x, y + 1)
      const touching = SIDES.filter(([i, j]) => at(x + i, y + j)).length
      if (!(h && v && touching === 2) || piece(x, y) <= 9) continue
      const c = rim[y][x]
      rim[y][x] = '.'
      if (shapeOf(rim) !== keep) rim[y][x] = c
    }
  return rim
}

export function thick(g, form) {
  const grown = grow(g, form)
  const on = (x, y) => grown[y]?.[x] !== undefined && grown[y][x] !== '.'
  const inner = (x, y) => on(x, y) && SIDES.every(([i, j]) => on(x + i, y + j))
  // the grown mark as a body the shaders know: its edge ink, its middle an inside to shade along the light
  const weft = (h) => each(h, (c, x, y) => (c === '#' && grown[y][x] === 'w' ? 'w' : c))
  if (form === 'solid')
    // lit: the side toward the light breaks into checker and clear, the far end stays ink
    return weft(solid(each(grown, (c, x, y) => (c === '.' ? '.' : inner(x, y) ? ':' : '#'))))
  const rim = smooth(
    each(grown, (c, x, y) => (c !== '.' && !inner(x, y) ? c : '.')),
    on,
  )
  // depth: the clear middle takes dither on its shadow side, walked along the light, as a body's inside does. A cast
  // shadow under the strokes was tried: under a bar it reads as a serrated edge.
  const base = each(rim, (c, x, y) => (c !== '.' ? '#' : inner(x, y) ? ':' : '.'))
  return weft(hollow(base, false, '+'))
}

/** The inside mark of a body thinned to one cell, so the outer line is the heavier one. A cell on the bottom or right of a
 *  two-cell stroke goes when the weft keeps its pieces without it. */
export function slim(g) {
  const out = g.map((r) => r.slice())
  const isW = (x, y) => out[y]?.[x] === 'w'
  const layer = () => topology(out.map((r) => r.map((c) => c === 'w')))
  const keep = layer()
  for (let y = 0; y < 16; y++)
    for (let x = 0; x < 16; x++) {
      if (!isW(x, y)) continue
      const right = isW(x - 1, y) && !isW(x + 1, y),
        bottom = isW(x, y - 1) && !isW(x, y + 1)
      if (!right && !bottom) continue
      out[y][x] = '.'
      if (layer() !== keep) out[y][x] = 'w'
    }
  return out
}
