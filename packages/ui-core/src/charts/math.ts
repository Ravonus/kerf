// warp's chart math (06 §2): hand-rolled scales, ticks, label window, monotone cubic, arcs and squarify, ported from
// the data specimen's chart engine. Pure, so a chart lays out the same on the server and in the browser.

export const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v))
export const f1 = (v: number) => v.toFixed(1)
export const sum = (a: number[]) => a.reduce((x, y) => x + y, 0)
const plain = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 })
export const num = (v: number) => plain.format(v)
export const pct = (v: number) => `${Math.round(v * 100)}%`

/** The 1st–8th categorical colour; the 9th series onward folds into `other` (06 §3). */
export const color = (i: number) => `var(--warp-color-data-${i < 8 ? i + 1 : 'other'})`
export const seq = (b: number) => `var(--warp-color-data-seq-${b})`

export const lin = (d0: number, d1: number, r0: number, r1: number) => (v: number) => r0 + ((v - d0) / (d1 - d0 || 1)) * (r1 - r0)

export function niceTicks(min: number, max: number, count: number) {
  if (min === max) max = min + 1
  const step0 = (max - min) / Math.max(1, count), mag = 10 ** Math.floor(Math.log10(step0)), e = step0 / mag
  const step = (e >= 7.5 ? 10 : e >= 3.5 ? 5 : e >= 1.5 ? 2 : 1) * mag
  const lo = Math.floor(min / step) * step, hi = Math.ceil(max / step) * step, t: number[] = []
  for (let v = lo; v <= hi + step / 2; v += step) t.push(+v.toFixed(10))
  return t
}

/** Which of `n` labels to show: both ends, interior on an even step, one closer than 0.6 step to the last dropped. */
export function labelWindow(n: number, max: number) {
  if (n <= max || max < 2) return new Set(Array.from({ length: n }, (_, i) => i))
  const last = n - 1, step = Math.ceil(last / (max - 1)), s = new Set([0, last])
  for (let i = step; i < last; i += step) if (last - i >= step * 0.6) s.add(i)
  return s
}

/** Monotone-x cubic: a line never invents a peak the data lacks. */
export function monotone(pts: number[][]) {
  const n = pts.length
  if (n < 2) return n ? `M${f1(pts[0][0])},${f1(pts[0][1])}` : ''
  const dx: number[] = [], dy: number[] = [], m: number[] = [], t: number[] = []
  for (let i = 0; i < n - 1; i++) { dx[i] = pts[i + 1][0] - pts[i][0]; dy[i] = pts[i + 1][1] - pts[i][1]; m[i] = dy[i] / dx[i] }
  t[0] = m[0]
  t[n - 1] = m[n - 2]
  for (let i = 1; i < n - 1; i++) t[i] = m[i - 1] * m[i] <= 0 ? 0 : (3 * (dx[i - 1] + dx[i])) / ((2 * dx[i] + dx[i - 1]) / m[i - 1] + (dx[i] + 2 * dx[i - 1]) / m[i])
  let d = `M${f1(pts[0][0])},${f1(pts[0][1])}`
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3
    d += `C${f1(pts[i][0] + h)},${f1(pts[i][1] + t[i] * h)} ${f1(pts[i + 1][0] - h)},${f1(pts[i + 1][1] - t[i + 1] * h)} ${f1(pts[i + 1][0])},${f1(pts[i + 1][1])}`
  }
  return d
}

/** A bar with only its value end rounded. */
export function barPath(x: number, y: number, w: number, h: number, r: number, dir: 'up' | 'right' = 'up') {
  r = Math.max(0, Math.min(r, (dir === 'up' ? w : h) / 2, Math.abs(dir === 'up' ? h : w)))
  const X = f1(x), Y = f1(y), R = f1(x + w), B = f1(y + h)
  if (dir === 'right') return `M${X},${Y}H${f1(x + w - r)}Q${R},${Y} ${R},${f1(y + r)}V${f1(y + h - r)}Q${R},${B} ${f1(x + w - r)},${B}H${X}Z`
  return `M${X},${B}V${f1(y + r)}Q${X},${Y} ${f1(x + r)},${Y}H${f1(x + w - r)}Q${R},${Y} ${R},${f1(y + r)}V${B}Z`
}

export const polar = (cx: number, cy: number, r: number, a: number) => [cx + r * Math.cos(a), cy + r * Math.sin(a)]

/** An open arc, clockwise from `a0` to `a1`. */
export function arc(cx: number, cy: number, R: number, a0: number, a1: number) {
  const [x0, y0] = polar(cx, cy, R, a0), [x1, y1] = polar(cx, cy, R, a1)
  return `M${x0.toFixed(2)},${y0.toFixed(2)}A${R},${R} 0 ${a1 - a0 > Math.PI ? 1 : 0} 1 ${x1.toFixed(2)},${y1.toFixed(2)}`
}

/** A closed ring segment (sunburst). */
export function ring(cx: number, cy: number, r0: number, r1: number, a0: number, a1: number) {
  const g = 0.012, A0 = a0 + g, A1 = a1 - g, L = A1 - A0 > Math.PI ? 1 : 0
  const p = (r: number, a: number) => polar(cx, cy, r, a).map(f1).join(',')
  return `M${p(r1, A0)}A${r1},${r1} 0 ${L} 1 ${p(r1, A1)}L${p(r0, A1)}A${r0},${r0} 0 ${L} 0 ${p(r0, A0)}Z`
}

export type Cell<T> = T & { a: number; x: number; y: number; w: number; h: number }

/** Squarified treemap of items already sorted by `a` (area) descending. */
export function squarify<T extends { a: number }>(list: T[], x: number, y: number, w: number, h: number) {
  const out: Cell<T>[] = []
  let rest = [...list]
  while (rest.length) {
    const short = Math.min(w, h)
    let row: T[] = [], best = Infinity
    for (const it of rest) {
      const t = [...row, it], s = sum(t.map(b => b.a))
      const worst = Math.max(...t.map(r => Math.max((short * short * r.a) / (s * s), (s * s) / (short * short * r.a))))
      if (worst > best) break
      best = worst
      row = t
    }
    const thick = sum(row.map(b => b.a)) / short
    let o = 0
    for (const r of row) {
      const len = r.a / thick
      out.push(w >= h ? { ...r, x, y: y + o, w: thick, h: len } : { ...r, x: x + o, y, w: len, h: thick })
      o += len
    }
    if (w >= h) { x += thick; w -= thick } else { y += thick; h -= thick }
    rest = rest.slice(row.length)
  }
  return out
}

/** The value at `p` of an ascending list (the specimen's floor quantile). */
export const quantile = (sorted: number[], p: number) => sorted[Math.floor(p * (sorted.length - 1))]
