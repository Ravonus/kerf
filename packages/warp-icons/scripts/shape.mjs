// Geometry for the outline tiers, in 16-pixel units: specs flattened to polylines, the notch closed, and an open mark
// laid out as a thickened stroke, so hollow can draw round it and solid can fill it.

const pts = (w) => w.map((p) => p.split(',').map(Number))
const STEP = 0.25 // flattening: no chord longer than this, in units

function arcPoints(o, rx, large, sweep, x, y) {
  // circular arcs only, as in draw.mjs and raster.mjs
  const dx = x - o[0],
    dy = y - o[1],
    d = Math.hypot(dx, dy) || 1,
    r = Math.max(rx, d / 2)
  const h = Math.sqrt(Math.max(0, r * r - (d * d) / 4)) * (large === sweep ? -1 : 1)
  const cx = (o[0] + x) / 2 - (h * dy) / d,
    cy = (o[1] + y) / 2 + (h * dx) / d
  const a0 = Math.atan2(o[1] - cy, o[0] - cx)
  let a1 = Math.atan2(y - cy, x - cx)
  if (sweep && a1 < a0) a1 += Math.PI * 2
  if (!sweep && a1 > a0) a1 -= Math.PI * 2
  const n = Math.max(4, Math.ceil((Math.abs(a1 - a0) * r) / STEP))
  const out = []
  for (let i = 1; i <= n; i++) {
    const t = a0 + ((a1 - a0) * i) / n
    out.push([cx + r * Math.cos(t), cy + r * Math.sin(t)])
  }
  out[out.length - 1] = [x, y]
  return { pts: out, c: [cx, cy], r }
}

/** A raw `p` path as subpaths: { pts, closed, last } where last says how the subpath ends, for closing a notch. */
function rawPaths(words) {
  const toks = words.join(' ').match(/[MLHVQCAZ]|-?\d*\.?\d+/g)
  const subs = []
  let i = 0,
    cur = [0, 0],
    sub = null
  const take = (k) => {
    const v = toks.slice(i, i + k).map(Number)
    i += k
    return v
  }
  const more = () => i < toks.length && !/[A-Z]/.test(toks[i])
  const to = (p, last) => {
    sub.pts.push(p)
    sub.last = last
    cur = p
  }
  const curve = (f, steps) => {
    for (let k = 1; k <= steps; k++) sub.pts.push(f(k / steps))
    cur = sub.pts.at(-1)
    sub.last = { op: 'curve' }
  }
  while (i < toks.length) {
    const c = toks[i++]
    if (c === 'M') {
      sub = { pts: [], closed: false, last: null }
      subs.push(sub)
      to(take(2), { op: 'L' })
      while (more()) to(take(2), { op: 'L' })
    } else if (c === 'Z') sub.closed = true
    else if (c === 'H') to([take(1)[0], cur[1]], { op: 'L' })
    else if (c === 'V') to([cur[0], take(1)[0]], { op: 'L' })
    else if (c === 'L') do to(take(2), { op: 'L' }); while (more())
    else if (c === 'Q')
      do {
        const [a, b, x, y] = take(4),
          o = cur
        curve(
          (t) => [
            (1 - t) ** 2 * o[0] + 2 * (1 - t) * t * a + t * t * x,
            (1 - t) ** 2 * o[1] + 2 * (1 - t) * t * b + t * t * y,
          ],
          24,
        )
      } while (more())
    else if (c === 'C')
      do {
        const [a, b, c2, d, x, y] = take(6),
          o = cur
        curve((t) => {
          const u = 1 - t
          return [
            u ** 3 * o[0] + 3 * u * u * t * a + 3 * u * t * t * c2 + t ** 3 * x,
            u ** 3 * o[1] + 3 * u * u * t * b + 3 * u * t * t * d + t ** 3 * y,
          ]
        }, 32)
      } while (more())
    else if (c === 'A')
      do {
        const [rx, , , large, sweep, x, y] = take(7),
          a = arcPoints(cur, rx, large, sweep, x, y)
        sub.pts.push(...a.pts)
        sub.last = { op: 'A', c: a.c, r: a.r, sweep, o: cur }
        cur = [x, y]
      } while (more())
    else throw new Error(`raw path: ${c}`)
  }
  return subs
}

const circle = (cx, cy, r) => {
  const n = Math.max(12, Math.ceil((2 * Math.PI * r) / STEP))
  return {
    pts: Array.from({ length: n }, (_, i) => [
      cx + r * Math.cos((2 * Math.PI * i) / n),
      cy + r * Math.sin((2 * Math.PI * i) / n),
    ]),
    closed: true,
  }
}

/** One spec command as polylines. The notch is already shut: box is a rect, ring a circle. */
export function flatten(text) {
  const [op, ...w] = text.trim().split(/\s+/)
  const v = w.map(Number)
  switch (op) {
    case 'ln':
    case 'pl':
      return [{ pts: pts(w), closed: false }]
    case 'pg':
    case 'sg':
      return [{ pts: pts(w), closed: true }]
    case 'rect':
    case 'box': {
      const [x, y, a, b] = v
      return [
        {
          pts: [
            [x, y],
            [x + a, y],
            [x + a, y + b],
            [x, y + b],
          ],
          closed: true,
        },
      ]
    }
    case 'ring':
    case 'circ':
      return [circle(v[0], v[1], v[2])]
    case 'dot':
      return pts(w).map((p) => ({ pts: [p], closed: false, dot: true }))
    case 'p':
      return rawPaths(w)
    default:
      throw new Error(`unknown draw op ${op} in "${text}"`)
  }
}

export const commands = (part) =>
  part
    .split(';')
    .map((c) => c.trim())
    .filter(Boolean)

// ---- the notch -------------------------------------------------------------------------------------------------------
// The outline tiers draw every body whole. A spec may leave a notch three ways: `box` and `ring` draw one, and a `pl` or
// `p` stops short of where it began, in the direction it was going, the gap warp's floated label leaves.
const GAP = 3.6
const unit = ([x, y]) => {
  const l = Math.hypot(x, y) || 1
  return [x / l, y / l]
}
const dot2 = (a, b) => a[0] * b[0] + a[1] * b[1]
const sub2 = (a, b) => [a[0] - b[0], a[1] - b[1]]
const tangentOut = (p) => unit(sub2(p.at(-1), p.at(-2)))
const tangentIn = (p) => unit(sub2(p[1], p[0]))

/** Does a path that ends at `end` heading `dir` run straight on, or round its own circle, into `start`? */
function reaches(end, dir, last, start, startDir, top) {
  const gap = sub2(start, end),
    d = Math.hypot(...gap)
  if (d < 0.05 || d > GAP) return false
  // the notch is in the top edge: a break anywhere else (an arrow's, a slash's) is drawn on purpose
  if (Math.max(end[1], start[1]) > top + 1.8 || Math.abs(gap[1]) > Math.abs(gap[0])) return false
  if (last?.op === 'A') {
    const r = Math.hypot(...sub2(start, last.c))
    return Math.abs(r - last.r) < 0.35
  }
  return dot2(unit(gap), dir) > 0.82 && dot2(unit(gap), startDir) > 0.82
}

/** Does any of these points sit on the middle half of the gap from a to b? */
function crosses(a, b, points) {
  const d = sub2(b, a),
    l2 = dot2(d, d) || 1
  return points.some((q) => {
    const t = Math.min(0.75, Math.max(0.25, dot2(sub2(q, a), d) / l2))
    return Math.hypot(...sub2(q, [a[0] + d[0] * t, a[1] + d[1] * t])) < 0.5
  })
}

/** The notches in one spec part: pairs [from, to] of command indices whose gap closes, `from === to` for a self-gap. */
export function notches(part, avoid = []) {
  const cmds = commands(part)
  const info = cmds.map((c) => {
    const [op, ...w] = c.split(/\s+/)
    if (op === 'pl' || op === 'ln') {
      const p = pts(w)
      return p.length > 2 || op === 'pl' ? { op, p, last: { op: 'L' } } : null
    }
    if (op === 'p') {
      const s = rawPaths(w)
      return s.length === 1 && !s[0].closed && s[0].pts.length > 1
        ? { op, p: s[0].pts, last: s[0].last }
        : null
    }
    return null
  })
  const top = Math.min(...cmds.flatMap((c) => flatten(c).flatMap((s) => s.pts.map((p) => p[1]))))
  const out = []
  const used = new Set()
  for (let i = 0; i < info.length; i++) {
    const a = info[i]
    if (!a || a.p.length < 2) continue
    for (let j = 0; j < info.length; j++) {
      const b = info[j]
      if (!b || b.p.length < 2 || used.has(j)) continue
      if (i === j && a.p.length < 3) continue
      // a gap the weft runs through, like an -off icon's slash, is the slash's
      if (crosses(a.p.at(-1), b.p[0], avoid)) continue
      if (reaches(a.p.at(-1), tangentOut(a.p), a.last, b.p[0], tangentIn(b.p), top)) {
        out.push([i, j])
        used.add(j)
        break
      }
    }
  }
  return out
}

/** Points every quarter unit along a polyline, so a distance test can't step over a line. */
function dense(p) {
  const out = [p[0]]
  for (let i = 1; i < p.length; i++) {
    const n = Math.ceil(Math.hypot(...sub2(p[i], p[i - 1])) / 0.25)
    for (let k = 1; k <= n; k++)
      out.push([p[i - 1][0] + ((p[i][0] - p[i - 1][0]) * k) / n, p[i - 1][1] + ((p[i][1] - p[i - 1][1]) * k) / n])
  }
  return out
}
const fmt = (v) => String(+v.toFixed(3))
const collinear = (a, p, b) =>
  Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) < 1e-6 &&
  dot2(sub2(p, a), sub2(b, p)) > 0

/** A closed point list without the points a straight edge runs through. */
function tidy(p) {
  let q = p.slice()
  for (let changed = true; changed && q.length > 3; ) {
    changed = false
    for (let i = 0; i < q.length; i++) {
      const a = q[(i - 1 + q.length) % q.length],
        b = q[(i + 1) % q.length]
      if (collinear(a, q[i], b)) {
        q.splice(i, 1)
        changed = true
        break
      }
    }
  }
  return q
}

/** Rewrite an `A` that ends at `from` so it runs on to `to` round the same circle. */
function extendArc(text, to, { c, sweep, o }) {
  const m = text.match(/^(.*A\s*)(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([01])\s+([01])\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/)
  if (!m) return null
  const [, head, rx, ry, rot, , sw] = m
  let large = 0
  {
    const a0 = Math.atan2(o[1] - c[1], o[0] - c[0])
    let a1 = Math.atan2(to[1] - c[1], to[0] - c[0])
    if (sweep && a1 < a0) a1 += 2 * Math.PI
    if (!sweep && a1 > a0) a1 -= 2 * Math.PI
    large = Math.abs(a1 - a0) > Math.PI ? 1 : 0
  }
  return `${head}${rx} ${ry} ${rot} ${large} ${sw} ${fmt(to[0])} ${fmt(to[1])}`
}

/** A spec part with its notches closed: box → rect, ring → circ, and a pl or p that stops short joined to where it meets. */
export function shut(part, weft = '') {
  const avoid = commands(weft).flatMap((c) => flatten(c).flatMap((s) => dense(s.pts)))
  const cmds = commands(part).map((c) =>
    c.replace(/^box\b/, 'rect').replace(/^ring\s+(\S+)\s+(\S+)\s+(\S+)/, (all, x, y, r) => `circ ${x} ${y} ${r}`),
  )
  const pairs = notches(cmds.join(';'), avoid)
  if (!pairs.length) return cmds.join('; ')
  const next = new Map(pairs.map(([i, j]) => [i, j]))
  const into = new Set(pairs.map(([, j]) => j))
  const done = new Set(),
    out = []
  const chainFrom = (start) => {
    const chain = [start]
    let k = start
    while (next.has(k) && next.get(k) !== start && !chain.includes(next.get(k))) {
      k = next.get(k)
      chain.push(k)
    }
    return { chain, loops: next.get(k) === start }
  }
  const heads = [...cmds.keys()].filter((i) => !into.has(i) || !pairs.length)
  const order = [...heads, ...cmds.keys()]
  for (const i of order) {
    if (done.has(i)) continue
    if (!next.has(i) && !into.has(i)) {
      out.push(cmds[i])
      done.add(i)
      continue
    }
    const { chain, loops } = chainFrom(i)
    chain.forEach((k) => done.add(k))
    out.push(join(chain.map((k) => cmds[k]), loops))
  }
  return out.join('; ')
}

/** Joined commands as one: polylines become one point list, anything with a `p` becomes one raw path. */
function join(list, loops) {
  const ops = list.map((c) => c.split(/\s+/)[0])
  if (ops.every((o) => o === 'pl' || o === 'ln')) {
    let p = list.flatMap((c) => pts(c.split(/\s+/).slice(1)))
    p = p.filter((q, i) => !i || q[0] !== p[i - 1][0] || q[1] !== p[i - 1][1])
    if (loops) {
      if (p.length > 1 && p[0][0] === p.at(-1)[0] && p[0][1] === p.at(-1)[1]) p.pop()
      return `pg ${tidy(p)
        .map((q) => q.map(fmt).join(','))
        .join(' ')}`
    }
    return `pl ${p.map((q) => q.map(fmt).join(',')).join(' ')}`
  }
  // raw: each piece as path text, then joined at its ends
  const raw = list.map((c) => {
    const [op, ...w] = c.split(/\s+/)
    if (op === 'p') return w.join(' ')
    const p = pts(w)
    return `M${p[0].join(' ')} ` + p.slice(1).map((q) => `L${q.join(' ')}`).join(' ')
  })
  const firstOf = (t) => t.match(/^M\s*(-?[\d.]+)\s+(-?[\d.]+)/).slice(1).map(Number)
  let text = raw[0]
  for (let k = 1; k <= raw.length; k++) {
    if (k === raw.length && !loops) break
    const target = k === raw.length ? firstOf(raw[0]) : firstOf(raw[k])
    const s = rawPaths(text.split(/\s+/)).at(-1)
    const ext = s.last?.op === 'A' ? extendArc(text, target, s.last) : null
    text = ext ?? `${text} L${fmt(target[0])} ${fmt(target[1])}`
    if (k < raw.length) text += ' ' + raw[k].replace(/^M\s*(-?[\d.]+)\s+(-?[\d.]+)/, '')
  }
  const s = rawPaths(text.split(/\s+/))[0]
  const meets = Math.hypot(...sub2(s.pts[0], s.pts.at(-1))) < 0.05
  return `p ${text}${loops || meets ? ' Z' : ''}`
}

// ---- open marks --------------------------------------------------------------------------------------------------------
// An icon with no body to fill (an arrow, a check, a menu) is drawn as an object of its own: its strokes thickened into a
// shape, which hollow draws round and solid fills. Closed shapes in such a mark (a chart's bars, a slider's knob) stay
// outlines in hollow and fill in solid.

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
    for (let i = 1; i < o.length; i++) along.push(along[i - 1] + Math.hypot(o[i][0] - o[i - 1][0], o[i][1] - o[i - 1][1]))
    for (let i = 0; i < o.length; i += 2)
      for (let j = i + 2; j < o.length; j += 2) {
        const d = Math.hypot(o[i][0] - o[j][0], o[i][1] - o[j][1])
        if (along[j] - along[i] > 2.2 * d + 2) best = Math.min(best, d)
      }
  }
  for (let i = 0; i < objs.length; i++)
    for (let j = i + 1; j < objs.length; j++) {
      let d = Infinity
      for (const a of objs[i]) for (const b of objs[j]) d = Math.min(d, Math.hypot(a[0] - b[0], a[1] - b[1]))
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
export function layout(body, weft, tier) {
  const t = MARK[tier]
  const cmds = [...commands(body), ...commands(weft)]
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
