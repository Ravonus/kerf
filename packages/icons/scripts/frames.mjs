// The pixel tier's two drawn containers, so every ring and box has the same notch and the same shade. `over` lays
// hand-placed cells on one: `#` ink, `+` shade, `o` clears, `.` leaves what is there.
const blank = () => Array.from({ length: 16 }, () => Array(16).fill('.'))
const text = g => g.map(r => r.join('')).join('\n')

export function over(base, art) {
  const g = base.split('\n').map(r => r.padEnd(16, '.').split(''))
  while (g.length < 16) g.push(Array(16).fill('.'))
  art.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n').forEach((row, y) => {
    row.trim().split('').forEach((c, x) => { if (c === 'o') g[y][x] = '.'; else if (c !== '.') g[y][x] = c })
  })
  return text(g)
}

/** A stepped frame, the notch third from the left, shade inside the right and bottom edges. */
export function frame(x0, y0, x1, y1, { notch = true, shade = true } = {}) {
  const g = blank()
  for (let x = x0 + 1; x < x1; x++) { g[y0][x] = '#'; g[y1][x] = '#' }
  for (let y = y0 + 1; y < y1; y++) { g[y][x0] = '#'; g[y][x1] = '#' }
  if (notch) g[y0][x0 + 3] = '.'
  if (shade) {
    for (let y = y0 + 2; y < y1; y++) g[y][x1 - 1] = '+'
    for (let x = x0 + 2; x < x1 - 1; x++) g[y1 - 1][x] = '+'
  }
  return text(g)
}

export const RING = `
.
.....#####
...#......##
..#.........#
..#.........#
.#..........+#
.#..........+#
.#..........+#
.#..........+#
.#..........+#
..#........+#
..#.......++#
...##+++++##
.....#####
`.trim()
