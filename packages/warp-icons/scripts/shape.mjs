// Geometry for the outline tiers, in 16-pixel units: specs flattened to polylines, and the notch closed. mark.mjs lays
// out the open marks on top of it.

export const pts = (w) => w.map((p) => p.split(',').map(Number))
const STEP = 0.25 // flattening: no chord longer than this, in units

function arcPoints(o, rx, { large, sweep, x, y }) {
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
    else if (c === 'L')
      do to(take(2), { op: 'L' })
      while (more())
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
          a = arcPoints(cur, rx, { large, sweep, x, y })
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
function reaches({ end, dir, last, start, startDir, top }) {
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
      if (
        reaches({
          end: a.p.at(-1),
          dir: tangentOut(a.p),
          last: a.last,
          start: b.p[0],
          startDir: tangentIn(b.p),
          top,
        })
      ) {
        out.push([i, j])
        used.add(j)
        break
      }
    }
  }
  return out
}

/** Points every quarter unit along a polyline, so a distance test can't step over a line. */
export function dense(p) {
  const out = [p[0]]
  for (let i = 1; i < p.length; i++) {
    const n = Math.ceil(Math.hypot(...sub2(p[i], p[i - 1])) / 0.25)
    for (let k = 1; k <= n; k++)
      out.push([
        p[i - 1][0] + ((p[i][0] - p[i - 1][0]) * k) / n,
        p[i - 1][1] + ((p[i][1] - p[i - 1][1]) * k) / n,
      ])
  }
  return out
}
const fmt = (v) => String(+v.toFixed(3))
const collinear = (a, p, b) =>
  Math.abs((p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0])) < 1e-6 &&
  dot2(sub2(p, a), sub2(b, p)) > 0

/** A closed point list without the points a straight edge runs through. */
function tidy(p) {
  const q = p.slice()
  for (let changed = true; changed && q.length > 3;) {
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
  const m = text.match(
    /^(.*A\s*)(-?[\d.]+)\s+(-?[\d.]+)\s+(-?[\d.]+)\s+([01])\s+([01])\s+(-?[\d.]+)\s+(-?[\d.]+)\s*$/,
  )
  if (!m) return null
  const [, head, rx, ry, rot, , sw] = m
  const a0 = Math.atan2(o[1] - c[1], o[0] - c[0])
  let a1 = Math.atan2(to[1] - c[1], to[0] - c[0])
  if (sweep && a1 < a0) a1 += 2 * Math.PI
  if (!sweep && a1 > a0) a1 -= 2 * Math.PI
  const large = Math.abs(a1 - a0) > Math.PI ? 1 : 0
  return `${head}${rx} ${ry} ${rot} ${large} ${sw} ${fmt(to[0])} ${fmt(to[1])}`
}

/** A spec part with its notches closed: box → rect, ring → circ, and a pl or p that stops short joined to where it meets. */
export function shut(part, weft = '') {
  const avoid = commands(weft).flatMap((c) => flatten(c).flatMap((s) => dense(s.pts)))
  const cmds = commands(part).map((c) =>
    c
      .replace(/^box\b/, 'rect')
      .replace(/^ring\s+(\S+)\s+(\S+)\s+(\S+)/, (all, x, y, r) => `circ ${x} ${y} ${r}`),
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
    out.push(
      join(
        chain.map((k) => cmds[k]),
        loops,
      ),
    )
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
    return (
      `M${p[0].join(' ')} ` +
      p
        .slice(1)
        .map((q) => `L${q.join(' ')}`)
        .join(' ')
    )
  })
  const firstOf = (t) =>
    t
      .match(/^M\s*(-?[\d.]+)\s+(-?[\d.]+)/)
      .slice(1)
      .map(Number)
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
