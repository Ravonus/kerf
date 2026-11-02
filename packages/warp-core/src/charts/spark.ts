import { f1, lin, monotone } from './math'
import { s } from './scene'

/** A sparkline's scene (no axes, end dot). */
export function sparkScene(values: number[], W: number, H = 36, pad = 4) {
  const mn = Math.min(...values), mx = Math.max(...values), x = lin(0, values.length - 1, pad, W - pad), y = lin(mn, mx, H - pad, pad)
  const pts = values.map((v, i) => [x(i), y(v)]), last = pts[pts.length - 1]!, d = monotone(pts)
  return [s('path', { class: 'ar', d: `${d}L${W - pad},${H}L${pad},${H}Z` }), s('path', { class: 'ln', d }), s('circle', { class: 'dot', cx: f1(last[0]!), cy: f1(last[1]!), r: 3 })]
}
