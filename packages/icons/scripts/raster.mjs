// The shared geometry behind the pixel tier: an outline spec lands on the 16×16 grid as one-pixel lines, and every pixel
// variant (hollow, solid, dithered) is worked out from a grid. Hand-drawn bitmaps go through the same variants.
const SIZE = 16
const blank = () => Array.from({ length: SIZE }, () => Array(SIZE).fill('.'))
const put = (g, x, y, c = '#') => { const X = Math.round(x), Y = Math.round(y); if (X >= 0 && Y >= 0 && X < SIZE && Y < SIZE) g[Y][X] = c }

function line(g, [x0, y0], [x1, y1]) {
  const steps = Math.max(Math.abs(Math.round(x1) - Math.round(x0)), Math.abs(Math.round(y1) - Math.round(y0)), 1)
  for (let i = 0; i <= steps; i++) put(g, x0 + (x1 - x0) * i / steps, y0 + (y1 - y0) * i / steps)
}
function poly(g, points, closed, cut) {
  const m = points.length, count = closed ? m : m - 1
  for (let i = 0; i < count; i++) line(g, points[i], points[(i + 1) % m])
  // a corner the outline rounds loses its pixel, the way the hand-drawn set does
  if (cut) for (let i = closed ? 0 : 1; i < (closed ? m : m - 1); i++) {
    const p = points[i], a = points[(i - 1 + m) % m], b = points[(i + 1) % m]
    const square = (a[0] === p[0] && b[1] === p[1]) || (a[1] === p[1] && b[0] === p[0])
    if (!square) continue
    const dx = Math.sign(a[0] - p[0]) + Math.sign(b[0] - p[0]), dy = Math.sign(a[1] - p[1]) + Math.sign(b[1] - p[1])
    if (Math.hypot(a[0] - p[0], a[1] - p[1]) > 2 && Math.hypot(b[0] - p[0], b[1] - p[1]) > 2) {
      put(g, p[0], p[1], '.')
      put(g, p[0] + dx, p[1], '#'); put(g, p[0], p[1] + dy, '#')
    }
  }
}
function arc(g, cx, cy, r, from = 0, to = Math.PI * 2) {
  const steps = Math.max(24, Math.ceil(r * 16))
  let last
  for (let i = 0; i <= steps; i++) {
    const t = from + (to - from) * i / steps, p = [cx + r * Math.cos(t), cy + r * Math.sin(t)]
    if (last) line(g, last, p)
    last = p
  }
}
const pts = w => w.map(p => p.split(',').map(Number))

function raw(g, words) {
  const toks = words.join(' ').match(/[MLHVQCAZ]|-?\d*\.?\d+/g)
  let i = 0, cur = [0, 0], start = [0, 0]
  const take = k => { const v = toks.slice(i, i + k).map(Number); i += k; return v }
  const more = () => i < toks.length && !/[A-Z]/.test(toks[i])
  const curve = f => { let last = cur; for (let s = 1; s <= 16; s++) { const p = f(s / 16); line(g, last, p); last = p } cur = last }
  while (i < toks.length) {
    const c = toks[i++]
    if (c === 'Z') { line(g, cur, start); cur = start }
    else if (c === 'H') { const p = [take(1)[0], cur[1]]; line(g, cur, p); cur = p }
    else if (c === 'V') { const p = [cur[0], take(1)[0]]; line(g, cur, p); cur = p }
    else if (c === 'M') { cur = start = take(2); while (more()) { const p = take(2); line(g, cur, p); cur = p } }
    else if (c === 'L') do { const p = take(2); line(g, cur, p); cur = p } while (more())
    else if (c === 'Q') do { const [a, b, x, y] = take(4), o = cur; curve(t => [(1 - t) ** 2 * o[0] + 2 * (1 - t) * t * a + t * t * x, (1 - t) ** 2 * o[1] + 2 * (1 - t) * t * b + t * t * y]) } while (more())
    else if (c === 'C') do { const [a, b, c2, d, x, y] = take(6), o = cur; curve(t => { const u = 1 - t; return [u ** 3 * o[0] + 3 * u * u * t * a + 3 * u * t * t * c2 + t ** 3 * x, u ** 3 * o[1] + 3 * u * u * t * b + 3 * u * t * t * d + t ** 3 * y] }) } while (more())
    else if (c === 'A') do {
      const [rx, , , large, sweep, x, y] = take(7), o = cur
      // circular arcs only: enough for this set, and an ellipse would not land on the grid anyway
      const dx = x - o[0], dy = y - o[1], d = Math.hypot(dx, dy) || 1, r = Math.max(rx, d / 2)
      const h = Math.sqrt(Math.max(0, r * r - d * d / 4)) * (large === sweep ? -1 : 1)
      const cx = (o[0] + x) / 2 - h * dy / d, cy = (o[1] + y) / 2 + h * dx / d
      let a0 = Math.atan2(o[1] - cy, o[0] - cx), a1 = Math.atan2(y - cy, x - cx)
      if (sweep && a1 < a0) a1 += Math.PI * 2
      if (!sweep && a1 > a0) a1 -= Math.PI * 2
      arc(g, cx, cy, r, a0, a1); cur = [x, y]
    } while (more())
  }
}

function command(g, text) {
  const [op, ...w] = text.trim().split(/\s+/)
  const v = w.map(Number)
  switch (op) {
    case 'ln': return poly(g, pts(w), false, false)
    case 'pl': return poly(g, pts(w), false, true)
    case 'pg': return poly(g, pts(w), true, true)
    case 'sg': return poly(g, pts(w), true, false)
    case 'rect': { const [x, y, a, b] = v; return poly(g, [[x, y], [x + a, y], [x + a, y + b], [x, y + b]], true, true) }
    case 'box': { const [x, y, a, b] = v; return poly(g, [[x + 4, y], [x + a, y], [x + a, y + b], [x, y + b], [x, y], [x + 1, y]], false, true) }
    case 'ring': {
      if (v[2] < 3) return arc(g, v[0], v[1], v[2])
      const mid = -125 * Math.PI / 180, half = 1.4 / v[2]
      return arc(g, v[0], v[1], v[2], mid + half, mid - half + Math.PI * 2)
    }
    case 'circ': return arc(g, v[0], v[1], v[2])
    case 'dot': for (const [x, y] of pts(w)) put(g, x, y); return
    case 'p': return raw(g, w)
    default: throw new Error(`unknown draw op ${op}`)
  }
}

/** `body / weft` as cells: body and weft both ink, returned apart so a variant can treat the meaning stroke on its own. */
export function rasterize(spec) {
  const [body = '', weft = ''] = spec.split('/')
  const g = blank(), w = blank()
  for (const c of body.split(';').filter(s => s.trim())) command(g, c)
  for (const c of weft.split(';').filter(s => s.trim())) command(w, c)
  return { body: g, weft: w, grid: g.map((row, y) => row.map((c, x) => (w[y][x] === '#' ? '#' : c))) }
}

/** Cells no path from outside the grid reaches: the inside of the drawing. */
export function enclosed(grid, wall = c => c === '#') {
  const out = Array.from({ length: SIZE }, () => Array(SIZE).fill(false))
  const stack = []
  for (let i = 0; i < SIZE; i++) stack.push([i, 0], [i, SIZE - 1], [0, i], [SIZE - 1, i])
  while (stack.length) {
    const [x, y] = stack.pop()
    if (x < 0 || y < 0 || x >= SIZE || y >= SIZE || out[y][x] || wall(grid[y][x])) continue
    out[y][x] = true
    stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1])
  }
  return grid.map((row, y) => row.map((c, x) => !wall(c) && !out[y][x]))
}

const count = (grid, c) => grid.flat().filter(v => v === c).length

/** A little of the hand set's light: shade on the inside of the lower right edges, never more than the ink. */
export function shaded(grid) {
  const inner = enclosed(grid)
  const out = grid.map(r => [...r])
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) if (inner[y][x] && (grid[y][x + 1] === '#' || grid[y + 1]?.[x] === '#')) out[y][x] = '+'
  return count(out, '+') * 2 < count(out, '#') ? out : grid
}

/** The outer edge only: shade goes, and a solid area keeps its rim. */
export function hollow(grid) {
  const ink = (x, y) => grid[y]?.[x] === '#'
  return grid.map((row, y) => row.map((c, x) => (c === '#' && !(ink(x + 1, y) && ink(x - 1, y) && ink(x, y + 1) && ink(x, y - 1)) ? '#' : '.')))
}

/** Filled in: the inside goes to ink, and a detail drawn inside it is cut out so it still reads. */
export function solid(grid) {
  const walls = c => c === '#'
  const inner = enclosed(grid.map(r => r.map(c => (c === '+' ? '.' : c))), walls)
  // the largest connected ink is the silhouette; anything else inside it is detail
  const seen = grid.map(r => r.map(() => 0)); let best = 0, bestId = 0, id = 0
  for (let y = 0; y < SIZE; y++) for (let x = 0; x < SIZE; x++) {
    if (grid[y][x] !== '#' || seen[y][x]) continue
    id++; let size = 0; const stack = [[x, y]]
    while (stack.length) {
      const [a, b] = stack.pop()
      if (grid[b]?.[a] !== '#' || seen[b][a]) continue
      seen[b][a] = id; size++
      for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) stack.push([a + i, b + j])
    }
    if (size > best) { best = size; bestId = id }
  }
  const inside = (x, y) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([i, j]) => { for (let k = 1; k < SIZE; k++) { const c = grid[y + j * k]?.[x + i * k]; if (c === undefined) return false; if (seen[y + j * k][x + i * k] === bestId) return true } return false })
  return grid.map((row, y) => row.map((c, x) => {
    if (inner[y][x]) return '#'
    if (c === '#' && seen[y][x] !== bestId && inside(x, y)) return '.'
    return c === '+' ? '.' : c
  }))
}

const BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
export const PATTERNS = {
  /** Every other cell: the coarsest two-tone, and the one that survives 16px. */
  checker: (x, y) => (x + y) % 2 === 0,
  /** A Bayer threshold, thinner than checker. */
  ordered: (x, y) => BAYER[y % 4][x % 4] < 6,
  /** Two diagonals. */
  crosshatch: (x, y) => (x + y) % 4 === 0 || (x - y + 16) % 4 === 0,
}

/** The drawing's insides shaded in a pattern, as `+` cells: ink stays, and the pattern never touches the outside. */
export function dither(grid, pattern) {
  const on = PATTERNS[pattern]
  const inner = enclosed(grid.map(r => r.map(c => (c === '+' ? '.' : c))))
  return grid.map((row, y) => row.map((c, x) => (c === '#' ? '#' : (inner[y][x] || c === '+') && on(x, y) ? '+' : '.')))
}

export const rows = grid => grid.map(r => r.join('')).join('\n')
