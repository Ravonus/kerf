// Open marks in the outline tiers, in 16-pixel units. An icon with no body to fill (an arrow, a check, a menu) is drawn
// as an object of its own: its strokes thickened into a shape, which hollow draws round and solid fills. Closed shapes in such a mark (a chart's bars, a slider's knob) stay
// outlines in hollow and fill in solid.
import { commands, dense, flatten, pts } from './shape.mjs'

const num = (v) => String(+v.toFixed(3))

/** A spec part with every coordinate scaled by s about c. */
export function scale(part, s, c = [7, 7]) {
  if (s === 1) return part
  const P = (x, y) => [num(c[0] + (x - c[0]) * s), num(c[1] + (y - c[1]) * s)]
  return commands(part)
    .map((cmd) => {
      const [op, ...w] = cmd.split(/\s+/)
      const v = w.map(Number)
      switch (op) {
        case 'ln':
        case 'pl':
        case 'pg':
        case 'sg':
        case 'dot':
          return `${op} ${pts(w)
            .map(([x, y]) => P(x, y).join(','))
            .join(' ')}`
        case 'rect':
        case 'box':
          return `${op} ${P(v[0], v[1]).join(' ')} ${num(v[2] * s)} ${num(v[3] * s)}`
        case 'ring':
        case 'circ':
          return `${op} ${P(v[0], v[1]).join(' ')} ${num(v[2] * s)}`
        case 'p': {
          const toks = w.join(' ').match(/[MLHVQCAZ]|-?\d*\.?\d+/g)
          const out = []
          let i = 0,
            cmdc = ''
          const per = { M: 2, L: 2, H: 1, V: 1, Q: 4, C: 6, A: 7, Z: 0 }
          while (i < toks.length) {
            if (/[A-Z]/.test(toks[i])) {
              cmdc = toks[i++]
              out.push(cmdc)
              continue
            }
            const k = per[cmdc],
              g = toks.slice(i, i + k).map(Number)
            i += k
            if (cmdc === 'H') out.push(num(c[0] + (g[0] - c[0]) * s))
            else if (cmdc === 'V') out.push(num(c[1] + (g[0] - c[1]) * s))
            else if (cmdc === 'A')
              out.push(num(g[0] * s), num(g[1] * s), g[2], g[3], g[4], ...P(g[5], g[6]))
            else for (let j = 0; j < k; j += 2) out.push(...P(g[j], g[j + 1]))
          }
          return `p ${out.join(' ')}`
        }
        default:
          throw new Error(`scale: ${op}`)
      }
    })
    .join('; ')
}

/** Is this command a closed shape with an inside, rather than a stroke? */
export const isClosed = (cmd) => {
  const [op, ...w] = cmd.split(/\s+/)
  if (op === 'dot') return false
  if (op === 'ln' || op === 'pl') {
    // a line that comes back to where it began, like a scale's pan
    const p = pts(w)
    return p.length > 3 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]
  }
  const f = flatten(cmd)
  if (!f.every((s) => s.closed)) return false
  // a disc this small is a dot with a rim: it reads as a stroke end, so it thickens like one
  if ((op === 'circ' || op === 'ring') && Number(cmd.split(/\s+/)[3]) < 1.4) return false
  return true
}

const bbox = (points) => {
  const xs = points.map((p) => p[0]),
    ys = points.map((p) => p[1])
  return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
}

/** The closest two separate objects in a mark come, centre line to centre line, in units, or one object to itself where
 *  it curls back, like redo's hook. */
function nearest(objs) {
  let best = Infinity
  for (const o of objs) {
    const along = [0]
    for (let i = 1; i < o.length; i++)
      along.push(along[i - 1] + Math.hypot(o[i][0] - o[i - 1][0], o[i][1] - o[i - 1][1]))
    for (let i = 0; i < o.length; i += 2)
      for (let j = i + 2; j < o.length; j += 2) {
        const d = Math.hypot(o[i][0] - o[j][0], o[i][1] - o[j][1])
        if (along[j] - along[i] > 2.2 * d + 2) best = Math.min(best, d)
      }
  }
  for (let i = 0; i < objs.length; i++)
    for (let j = i + 1; j < objs.length; j++) {
      let d = Infinity
      for (const a of objs[i])
        for (const b of objs[j]) d = Math.min(d, Math.hypot(a[0] - b[0], a[1] - b[1]))
      if (d > 0.3) best = Math.min(best, d)
    }
  return best
}

// px in the 24 box. W is the whole width of a thickened stroke; w the line hollow draws round it. Solid fills a stroke
// narrower than W: at full width a filled mark is a slab.
export const MARK = {
  quiet: { W: 4, Wmin: 3.2, w: 1, wMin: 1, core: 1.2, gap: 1.2, solid: 3 },
  balanced: { W: 5.5, Wmin: 4, w: 2.1, wMin: 1.5, core: 0.9, gap: 1.2, solid: 4 },
}
const LIMIT = 7.45 // units from the centre a mark's outer edge may reach: the 24 box, less a hair

/** How a mark is laid out in one tier: its scale about the centre, the stroke width W and the line w, in px. */
export function layout(body, kerf, tier) {
  const t = MARK[tier]
  const cmds = [...commands(body), ...commands(kerf)]
  const objs = cmds.flatMap((c) => flatten(c).map((s) => dense(s.pts)))
  const all = objs.flat()
  const [x0, y0, x1, y1] = bbox(all)
  const half = Math.max(7 - x0, x1 - 7, 7 - y0, y1 - 7) // units from the centre, centre line
  const d = nearest(objs) * 1.5 // px
  const fit = (W) => (LIMIT - W / 3) / half // W/2 px is W/3 units
  for (let W = t.W; W >= t.Wmin - 1e-9; W -= 0.25) {
    const sFit = fit(W)
    const sNeed = (W + t.gap) / d
    const s = Math.min(sFit, Math.max(1, sNeed), 1.3)
    if (s * d >= W + t.gap - 1e-9 || W - t.Wmin < 0.2) {
      const w = Math.max(t.wMin, Math.min(t.w, (W - t.core) / 2))
      return { s: +Math.min(s, sFit).toFixed(3), W, w, S: Math.min(t.solid, W) }
    }
  }
}
