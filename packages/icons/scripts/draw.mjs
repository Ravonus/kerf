// The drawing language: art/*.mjs entries become SVG path data. Outline coordinates are 16-pixel units, where u is the
// centre of pixel u at 16px, so every straight stroke lands on one pixel row at warp's default size (10-icons §2).
const X = u => +(1.5 * u + 0.75).toFixed(2)
const R = u => +(1.5 * u).toFixed(2)
// gap is measured between stroke ends, and the round caps eat one stroke width of it.
export const TIERS = { quiet: { corner: 1.6, gap: 2.2 }, balanced: { corner: 0.7, gap: 2.8 } }
const pts = s => s.map(p => p.split(',').map(Number))
const n = v => String(+v.toFixed(2)).replace(/^(-?)0\./, '$1.')

function rounded(points, closed, r) {
  const at = i => points[(i + points.length) % points.length]
  const out = []
  const m = points.length
  for (let i = 0; i < m; i++) {
    const p = at(i)
    if (!closed && (i === 0 || i === m - 1) || r === 0) { out.push(`${i ? 'L' : 'M'}${n(X(p[0]))} ${n(X(p[1]))}`); continue }
    const a = at(i - 1), b = at(i + 1)
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1])
    const c = Math.min(r, la / 2, lb / 2)
    const p1 = [p[0] + (a[0] - p[0]) * c / la, p[1] + (a[1] - p[1]) * c / la]
    const p2 = [p[0] + (b[0] - p[0]) * c / lb, p[1] + (b[1] - p[1]) * c / lb]
    out.push(`${i ? 'L' : 'M'}${n(X(p1[0]))} ${n(X(p1[1]))}Q${n(X(p[0]))} ${n(X(p[1]))} ${n(X(p2[0]))} ${n(X(p2[1]))}`)
  }
  return out.join('') + (closed ? 'z' : '')
}

// A raw path in pixel units: absolute M L H V Q C A Z only.
function raw(words) {
  const toks = words.join(' ').match(/[MLHVQCAZ]|-?\d*\.?\d+/g)
  let out = ''
  for (let i = 0; i < toks.length;) {
    const c = toks[i++]
    const take = k => { const v = toks.slice(i, i + k).map(Number); i += k; return v }
    const more = () => i < toks.length && !/[A-Z]/.test(toks[i])
    if (c === 'Z') out += 'z'
    else if (c === 'H' || c === 'V') out += c + n(X(take(1)[0]))
    else if (c === 'M' || c === 'L') do out += c + take(2).map(v => n(X(v))).join(' '); while (more())
    else if (c === 'Q') do out += c + take(4).map(v => n(X(v))).join(' '); while (more())
    else if (c === 'C') do out += c + take(6).map(v => n(X(v))).join(' '); while (more())
    else if (c === 'A') do { const [rx, ry, rot, l, s, x, y] = take(7); out += `A${n(R(rx))} ${n(R(ry))} ${rot} ${l} ${s} ${n(X(x))} ${n(X(y))}` } while (more())
    else throw new Error(`raw path: ${c}`)
  }
  return out
}

function ring(cx, cy, r, gap) {
  const half = gap / 2 / r, mid = -125 * Math.PI / 180
  const a = mid + half, b = mid - half
  const px = t => n(X(cx + r * Math.cos(t))), py = t => n(X(cy + r * Math.sin(t)))
  return `M${px(a)} ${py(a)}A${n(R(r))} ${n(R(r))} 0 1 1 ${px(b)} ${py(b)}`
}
const circ = (cx, cy, r) => `M${n(X(cx - r))} ${n(X(cy))}a${n(R(r))} ${n(R(r))} 0 1 0 ${n(R(2 * r))} 0a${n(R(r))} ${n(R(r))} 0 1 0 ${n(-R(2 * r))} 0z`

function command(text, t) {
  const [op, ...w] = text.trim().split(/\s+/)
  const v = w.map(Number)
  switch (op) {
    case 'ln': return rounded(pts(w), false, 0)
    case 'pl': return rounded(pts(w), false, t.corner)
    case 'pg': return rounded(pts(w), true, t.corner)
    case 'sg': return rounded(pts(w), true, 0) // a sharp closed mark: triangles, the bolt
    case 'rect': { const [x, y, a, b] = v; return rounded([[x, y], [x + a, y], [x + a, y + b], [x, y + b]], true, t.corner) }
    case 'box': { // the notch: warp's floated label, a gap in the top edge near the left corner
      const [x, y, a, b] = v
      return rounded([[x + 2 + t.gap, y], [x + a, y], [x + a, y + b], [x, y + b], [x, y], [x + 2, y]], false, t.corner)
    }
    case 'ring': return v[2] >= 3 ? ring(v[0], v[1], v[2], t.gap) : circ(...v)
    case 'circ': return circ(...v)
    case 'dot': return pts(w).map(([x, y]) => `M${n(X(x) - 0.3)} ${n(X(y))}h.6`).join('')
    case 'p': return raw(w)
    default: throw new Error(`unknown draw op ${op} in "${text}"`)
  }
}

const parts = (s, t) => s.split(';').filter(c => c.trim()).map(c => command(c, t)).join('')

/** `body / weft` → { body, weft } for one outline tier. */
export function outline(spec, tier) {
  const [body = '', weft = ''] = spec.split('/')
  return { body: parts(body, TIERS[tier]), weft: parts(weft, TIERS[tier]) }
}

/** Rows of `.`, `#` (ink) and `+` (shade), on 16×16: { ink, shade } as merged rect paths on the pixel grid. */
export function pixel(art, name) {
  if (Array.isArray(art)) return cells(art)
  const rows = art.replace(/^\s*\n/, '').replace(/\s+$/, '').split('\n').map(r => r.trim())
  if (rows.length > 16) throw new Error(`${name}: ${rows.length} rows`)
  while (rows.length < 16) rows.push('')
  const grid = rows.map((r, y) => {
    if (r.length > 16 || /[^.#+]/.test(r)) throw new Error(`${name}: bad row ${y}: ${r}`)
    return r.padEnd(16, '.').split('')
  })
  return cells(grid)
}

export function cells(grid) {
  const path = (...chars) => {
    const open = new Map() // "x:w" → rect still growing down
    const done = []
    for (let y = 0; y <= 16; y++) {
      const here = new Set()
      if (y < 16) for (let x = 0; x < 16;) {
        if (!chars.includes(grid[y][x])) { x++; continue }
        let w = 1
        while (x + w < 16 && chars.includes(grid[y][x + w])) w++
        const k = `${x}:${w}`
        here.add(k)
        if (open.has(k)) open.get(k).h++
        else open.set(k, { x, y, w, h: 1 })
        x += w
      }
      for (const [k, r] of open) if (!here.has(k)) { done.push(r); open.delete(k) }
    }
    return done.sort((a, b) => a.y - b.y || a.x - b.x).map(r => `M${r.x} ${r.y}h${r.w}v${r.h}h-${r.w}z`).join('')
  }
  return { ink: path('#'), shade: path('+'), both: path('#', '+'), grid }
}
