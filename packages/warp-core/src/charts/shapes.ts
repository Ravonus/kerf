// The forms without x and y axes (06 §12, specimen 05 and 10): round ones, part-to-whole ones and grids.
import { halo, mark } from './marks'
import { arc, color, f1, labelWindow, lin, num, pct, polar, ring, seq, squarify, sum } from './math'
import { s, type Kid } from './scene'
import { tableOf, type Base, type Fmt, type Form, type LegendItem, type TipRow } from './types'

const TAU = Math.PI * 2
const centred = (W: number, size: number, ...c: Kid[]) => s('g', { transform: `translate(${(W - size) / 2},0)` }, ...c)

export type Slice = { name: string; value: number; color?: string }
export type DonutConfig = Base<Slice[]> & { pie?: boolean; unit?: string; format?: Fmt; name?: string }
export const donut: Form<DonutConfig> = {
  kind: 'donut chart',
  byMark: true,
  legend: c => { const t = sum(c.data.map(d => d.value)); return c.data.map((d, i) => ({ name: d.name, color: d.color ?? color(i), value: pct(d.value / t) })) },
  table: c => { const t = sum(c.data.map(d => d.value)), f = c.format ?? num; return tableOf([c.name ?? 'Name', c.unit ?? 'Value', 'Share'], c.data.map(d => [d.name, f(d.value), pct(d.value / t)])) },
  summary: c => { const t = sum(c.data.map(d => d.value)), top = c.data.reduce((a, b) => (b.value > a.value ? b : a)); return `${top.name} is the largest share at ${pct(top.value / t)} of ${(c.format ?? num)(t)}.` },
  plot(c, W, x) {
    const size = Math.min(W, 232), R = size / 2 - 10, sw = Math.max(14, R * 0.2), mid = size / 2, list = c.data.map((d, i) => ({ ...d, i })).filter(d => !x.hidden.has(d.i)), total = sum(list.map(d => d.value)), f = c.format ?? num, gap = 2 / R, pie = c.pie
    const r = pie ? R / 2 + sw / 2 : R, width = pie ? R + sw : sw, unit = c.unit ?? 'total'
    let a = -Math.PI / 2
    const fine = (d: { name: string; value: number }) => `${d.name}: ${f(d.value)}${c.unit ? ` ${c.unit}` : ''}, ${pct(d.value / total)}`
    return {
      h: size, w: size, style: `inline-size:${size}px;max-inline-size:100%;margin-inline:auto`,
      body: [
        s('circle', { cx: mid, cy: mid, r, fill: 'none', stroke: 'var(--warp-color-surface-sunken)', 'stroke-width': width, 'aria-hidden': 'true' }),
        list.map((d, k) => {
          const span = (d.value / total) * TAU, a0 = a + gap / 2, a1 = a + span - gap / 2
          a += span
          return mark('path', d.i, 0, fine(d), { 'data-series': d.i, class: 'arc', style: `--_dc:${d.color ?? color(d.i)};--i:${k};--_aw-hot:${f1(width + 6)}px`, 'stroke-width': f1(width), pathLength: 1, 'stroke-dasharray': 1, d: arc(mid, mid, r, a0, a1) })
        }),
        !pie && [s('text', { class: 'center-v', x: mid, y: mid + 6, 'text-anchor': 'middle', 'aria-hidden': 'true' }, f(total)), s('text', { class: 'center-l', x: mid, y: mid + 24, 'text-anchor': 'middle', 'aria-hidden': 'true' }, unit)],
      ],
      tip: i => { const d = c.data[i]!; return { rows: [[d.color ?? color(i), d.name, f(d.value)]] } },
      on(m, svg) {
        const fig = svg.closest('figure')!, v = svg.querySelector('.center-v'), l = svg.querySelector('.center-l')
        fig.toggleAttribute('data-isolate', !!m)
        for (const n of svg.querySelectorAll('[data-mark]')) n.toggleAttribute('data-series-active', n === m)
        if (!v || !l) return
        const d = m && c.data[Number(m.getAttribute('data-xi'))]
        v.textContent = d ? pct(d.value / total) : f(total)
        l.textContent = d ? d.name : unit
      },
    }
  },
}

export type RadialConfig = Base<{ name: string; value: number }[]>
const A0 = -Math.PI / 2, SPAN = Math.PI * 1.5
export const radial: Form<RadialConfig> = {
  kind: 'radial bar chart',
  table: c => tableOf(['Name', 'Progress'], c.data.map(d => [d.name, pct(d.value)])),
  summary: c => { const a = [...c.data].sort((p, q) => q.value - p.value), z = a[a.length - 1]!; return `${a[0]!.name} is closest to target at ${pct(a[0]!.value)}; ${z.name} is furthest at ${pct(z.value)}.` },
  plot(c, W) {
    const size = Math.min(W, 230), mid = size / 2, sw = 12
    return {
      h: size,
      body: [centred(W, size, c.data.map((d, i) => {
        const R = mid - 10 - i * (sw + 5)
        return [s('path', { d: arc(mid, mid, R, A0, A0 + SPAN), fill: 'none', stroke: 'var(--warp-color-surface-sunken)', 'stroke-width': sw, 'stroke-linecap': 'round' }),
          mark('path', i, 0, `${d.name}: ${pct(d.value)}`, { class: 'arc', style: `--_dc:${color(i)};--i:${i};--_aw-hot:${sw + 4}px;stroke-linecap:round`, 'stroke-width': sw, pathLength: 1, 'stroke-dasharray': 1, d: arc(mid, mid, R, A0, A0 + SPAN * d.value) }),
          s('text', { class: 'lab-sub', x: mid - 8, y: mid - R + 4, 'text-anchor': 'end' }, s('tspan', {}, `${d.name} `), s('tspan', { style: 'font-weight:600;fill:var(--warp-color-text)' }, pct(d.value)))]
      }))],
    }
  },
}

export type RadarConfig = Base<{ name: string; values: number[] }[]> & { axes: string[]; format?: Fmt }
export const radar: Form<RadarConfig> = {
  kind: 'radar chart',
  swatch: 'line',
  legend: c => c.data.map((v, i) => ({ name: v.name, color: color(i) })),
  table: c => tableOf(['Axis', ...c.data.map(v => v.name)], c.axes.map((a, i) => [a, ...c.data.map(v => (c.format ?? num)(v.values[i]!))])),
  summary: c => `${c.data.map(v => v.name).join(' and ')} scored on ${c.axes.length} axes.`,
  plot(c, W, x) {
    const size = Math.min(W, 250), mid = size / 2, R = mid - 26, n = c.axes.length, f = c.format ?? num, P = (i: number, r: number): [number, number] => [mid + r * Math.sin((i / n) * TAU), mid - r * Math.cos((i / n) * TAU)]
    const web = (k: number) => c.axes.map((_, i) => P(i, R * k).map(f1).join(',')).join(' ')
    return {
      h: size,
      body: [centred(W, size,
        s('g', { class: 'grid', 'aria-hidden': 'true' }, [0.25, 0.5, 0.75, 1].map(k => s('polygon', { points: web(k), fill: 'none', stroke: 'var(--warp-color-data-grid)' })), c.axes.map((_, i) => s('line', { x1: mid, y1: mid, x2: P(i, R)[0], y2: P(i, R)[1] }))),
        s('g', { class: 'axis', 'aria-hidden': 'true' }, c.axes.map((a, i) => { const [X, Y] = P(i, R + 14); return s('text', { x: X, y: Y + 4, 'text-anchor': 'middle' }, a) })),
        c.data.map((v, si) => !x.hidden.has(si) && s('g', { 'data-series': si, style: `--_dc:${color(si)}` },
          s('polygon', { class: 's-poly', points: v.values.map((val, i) => P(i, R * val).map(f1).join(',')).join(' ') }),
          v.values.map((val, i) => { const [X, Y] = P(i, R * val); return mark('circle', i, si, `${v.name}, ${c.axes[i]}: ${f(val)}`, { class: 's-pt', cx: f1(X), cy: f1(Y), r: 3.5 }) }))))],
      tip: i => ({ title: c.axes[i]!, rows: c.data.map((v, si): TipRow => [color(si), v.name, f(v.values[i]!)]) }),
    }
  },
}

export type SunConfig = Base<{ name: string; children: { name: string; value: number }[] }[]> & { format?: Fmt; total?: string }
export const sunburst: Form<SunConfig> = {
  kind: 'sunburst chart',
  table: c => { const t = sum(c.data.flatMap(g => g.children.map(k => k.value))); return tableOf(['Category', 'Item', 'Share'], c.data.flatMap(g => g.children.map(k => [g.name, k.name, pct(k.value / t)]))) },
  summary: c => { const all = c.data.map(g => ({ n: g.name, v: sum(g.children.map(k => k.value)) })), t = sum(all.map(g => g.v)), top = all.reduce((a, b) => (b.v > a.v ? b : a)); return `${top.n} is ${pct(top.v / t)} of the total.` },
  plot(c, W) {
    const size = Math.min(W, 240), m = size / 2, t = sum(c.data.flatMap(g => g.children.map(k => k.value)))
    let a = -Math.PI / 2, k = 0
    const out = c.data.flatMap((g, ci) => {
      const total = sum(g.children.map(n => n.value)), a0 = a, base = color(ci)
      return [mark('path', k++, 0, `${g.name}: ${pct(total / t)}`, { class: 's-rect', style: `--_dc:${base}`, d: ring(m, m, m * 0.32, m * 0.62, a0, a0 + (total / t) * TAU) }),
        ...g.children.map((n, j) => { const a1 = a + (n.value / t) * TAU, d = ring(m, m, m * 0.64, m * 0.96, a, a1); a = a1; return mark('path', k++, 0, `${g.name} › ${n.name}: ${pct(n.value / t)}`, { class: 's-rect', style: `--_dc:color-mix(in oklab, ${base} ${80 - j * 22}%, var(--warp-color-surface-raised))`, d }) })]
    })
    return { h: size, body: [centred(W, size, out, s('text', { class: 'center-l', x: m, y: m + 4, 'text-anchor': 'middle' }, c.total ?? (c.format ?? num)(t)))] }
  },
}

export type Band = [from: number, to: number, color: string]
export type GaugeConfig = Base<number> & { bands?: Band[]; format?: Fmt; label?: string }
const BANDS: Band[] = [[0, 0.5, 'var(--warp-color-positive-solid)'], [0.5, 0.8, 'var(--warp-color-caution-solid)'], [0.8, 1, 'var(--warp-color-critical-solid)']]
export const gauge: Form<GaugeConfig> = {
  kind: 'gauge',
  table: c => tableOf(['Band', 'Range'], [...(c.bands ?? BANDS).map(([a, b], i): [string, string] => [`Band ${i + 1}`, `${pct(a)}–${pct(b)}`]), ['Current', pct(c.data)]]),
  summary: c => `${c.label ?? c.title}: ${pct(c.data)}.`,
  plot(c, W) {
    const size = Math.min(W, 260), cx = size / 2, cy = size * 0.56, R = size * 0.4, sw = 14, v = c.data, bands = c.bands ?? BANDS, at = (t: number) => Math.PI * (1 + t), hit = bands.find(([a, b]) => v >= a && v <= b)?.[2] ?? bands[0]![2], [nx, ny] = polar(cx, cy, R - 22, at(v))
    return {
      h: f1Num(cy + 44),
      body: [centred(W, size,
        bands.map(([a, b, col]) => s('path', { d: arc(cx, cy, R, at(a + 0.004), at(b - 0.004)), fill: 'none', stroke: col, 'stroke-opacity': 0.28, 'stroke-width': sw })),
        s('path', { d: arc(cx, cy, R, at(0), at(v)), fill: 'none', stroke: hit, 'stroke-width': sw, pathLength: 1, 'stroke-dasharray': 1, class: 'arc', style: `--_dc:${hit};stroke-linecap:butt` }),
        s('line', { x1: cx, y1: cy, x2: nx, y2: ny, stroke: 'var(--warp-color-text)', 'stroke-width': 2, 'stroke-linecap': 'round' }),
        s('circle', { cx, cy, r: 5, fill: 'var(--warp-color-text)' }),
        s('text', { class: 'center-v', x: cx, y: cy + 34, 'text-anchor': 'middle' }, pct(v)),
        mark('rect', 0, 0, `${c.label ?? c.title} ${pct(v)}`, { x: cx - R, y: cy - R - 10, width: 2 * R, height: R + 10, fill: 'transparent' }))],
    }
  },
}
const f1Num = (v: number) => +f1(v)

export type FunnelConfig = Base<{ name: string; value: number }[]> & { format?: Fmt; unit?: string }
const short = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v))
const ofPrev = (c: FunnelConfig, i: number) => Math.round((c.data[i]!.value / c.data[i - 1]!.value) * 100)
export const funnel: Form<FunnelConfig> = {
  kind: 'funnel chart',
  table: c => tableOf(['Step', c.unit ?? 'Value', 'Of previous'], c.data.map((d, i) => [d.name, (c.format ?? num)(d.value), i ? `${ofPrev(c, i)}%` : '–'])),
  summary: c => { const a = c.data, z = a[a.length - 1]!; return `Of ${(c.format ?? num)(a[0]!.value)} at ${a[0]!.name}, ${pct(z.value / a[0]!.value)} reach ${z.name}.` },
  plot(c, W) {
    const H = W < 420 ? 190 : 220, bh = (H - 10) / c.data.length - 6, x = lin(0, c.data[0]!.value, 0, W - 120), f = c.format ?? num
    return {
      h: H,
      body: c.data.map((d, i) => {
        const w = Math.max(4, x(d.value)), y = 4 + i * (bh + 6)
        return [mark('rect', i, 0, `${d.name}: ${f(d.value)}${i ? `, ${ofPrev(c, i)}% of previous` : ''}`, { class: 's-bar', style: `--_dc:${color(0)};--i:${i};fill-opacity:${+(1 - i * 0.12).toFixed(2)}`, x: 0, y, width: w, height: bh, rx: 3 }),
          s('text', { class: 'lab', x: w + 8, y: y + bh / 2 - 2 }, d.name),
          s('text', { class: 'lab-sub', x: w + 8, y: y + bh / 2 + 11 }, `${short(d.value)}${i ? ` · ${ofPrev(c, i)}%` : ''}`)]
      }),
    }
  },
}

export type TreeItem = { name: string; value: number; group?: string }
export type TreemapConfig = Base<TreeItem[]> & { groups?: string[]; format?: Fmt; short?: Fmt }
const groupsOf = (c: TreemapConfig) => c.groups ?? [...new Set(c.data.map(d => d.group ?? ''))]
export const treemap: Form<TreemapConfig> = {
  kind: 'treemap',
  legend: c => (groupsOf(c).length > 1 ? groupsOf(c).map((name, i): LegendItem => ({ name, color: color(i) })) : []),
  table: c => tableOf(['Name', 'Group', 'Value'], [...c.data].sort((a, b) => b.value - a.value).map(d => [d.name, d.group ?? '', (c.format ?? num)(d.value)])),
  summary: c => { const a = [...c.data].sort((p, q) => q.value - p.value); return `${a.length} items, ${(c.format ?? num)(sum(a.map(d => d.value)))} in total; the largest is ${a[0]!.name} at ${(c.format ?? num)(a[0]!.value)}.` },
  plot(c, W, x) {
    const H = W < 420 ? 220 : 260, g = groupsOf(c), f = c.format ?? num, fs = c.short ?? f, list = c.data.filter(d => !x.hidden.has(g.indexOf(d.group ?? ''))).sort((a, b) => b.value - a.value), t = sum(list.map(d => d.value))
    const cells = squarify(list.map(d => ({ ...d, a: (d.value / t) * W * H })), 0, 0, W, H)
    return {
      h: H,
      body: cells.map((b, i) => {
        const gi = g.indexOf(b.group ?? '')
        return [mark('rect', i, 0, `${b.name}${b.group ? ` (${b.group})` : ''}: ${f(b.value)}`, { class: 's-rect', style: `--_dc:${color(gi)}`, x: b.x, y: b.y, width: Math.max(0, b.w), height: Math.max(0, b.h), rx: 3 }),
          b.w > 80 && b.h > 34 && [s('text', { class: 'lab', style: halo, x: b.x + 8, y: b.y + 17 }, b.name.length * 6.4 > b.w - 12 ? `${b.name.slice(0, Math.floor((b.w - 16) / 6.6))}…` : b.name),
            s('text', { class: 'lab', style: `${halo};font-weight:400`, x: b.x + 8, y: b.y + 31 }, fs(b.value))]]
      }),
    }
  },
}

export type SankeyConfig = Base<{ from: number; to: number; value: number }[]> & { nodes: { name: string; column: number }[]; format?: Fmt }
export const sankey: Form<SankeyConfig> = {
  kind: 'sankey diagram',
  table: c => tableOf(['From', 'To', 'Value'], c.data.map(l => [c.nodes[l.from]!.name, c.nodes[l.to]!.name, (c.format ?? num)(l.value)])),
  summary: c => { const top = c.data.reduce((a, b) => (b.value > a.value ? b : a)); return `The largest flow is ${c.nodes[top.from]!.name} to ${c.nodes[top.to]!.name}, ${(c.format ?? num)(top.value)}.` },
  plot(c, W) {
    const H = W < 420 ? 220 : 250, { nodes, data: links } = c, f = c.format ?? num, cols = [...new Set(nodes.map(n => n.column))], last = Math.max(...cols, 1), nw = 10, pad = 14, colX = (k: number) => 4 + k * ((W - nw - 90) / last)
    const val = nodes.map((_, i) => Math.max(sum(links.filter(l => l.from === i).map(l => l.value)), sum(links.filter(l => l.to === i).map(l => l.value))))
    const k = Math.min(...cols.map(col => { const ns = nodes.flatMap((n, i) => (n.column === col ? [i] : [])); return (H - 10 - pad * (ns.length - 1)) / sum(ns.map(i => val[i]!)) }))
    const pos: { x: number; y: number; h: number; o: number; io: number }[] = []
    for (const col of cols) { let y = 4; nodes.forEach((n, i) => { if (n.column !== col) return; pos[i] = { x: colX(col), y, h: val[i]! * k, o: 0, io: 0 }; y += val[i]! * k + pad }) }
    const first = nodes.filter(n => n.column === cols[0]).length
    return {
      h: H,
      body: [
        links.map((l, i) => {
          const A = pos[l.from]!, B = pos[l.to]!, w = l.value * k, y0 = A.y + A.o + w / 2, y1 = B.y + B.io + w / 2, x0 = A.x + nw, x1 = B.x, mx = (x0 + x1) / 2
          A.o += w
          B.io += w
          return mark('path', i, 0, `${nodes[l.from]!.name} → ${nodes[l.to]!.name}: ${f(l.value)}`, { class: 's-flow', style: `--_dc:${color(l.from < first ? l.from : l.to % 2 ? 3 : 5)}`, 'stroke-width': f1(Math.max(1, w)), d: `M${f1(x0)},${f1(y0)}C${f1(mx)},${f1(y0)} ${f1(mx)},${f1(y1)} ${f1(x1)},${f1(y1)}` })
        }),
        nodes.map((n, i) => [s('rect', { x: pos[i]!.x, y: pos[i]!.y, width: nw, height: pos[i]!.h, rx: 2, fill: 'var(--warp-color-text)' }),
          s('text', { class: 'lab', style: halo, x: pos[i]!.x + nw + 6, y: pos[i]!.y + pos[i]!.h / 2 + 4 }, n.name),
          s('text', { class: 'lab-sub', style: halo, x: pos[i]!.x + nw + 6, y: pos[i]!.y + pos[i]!.h / 2 + 16 }, f(val[i]!))]),
      ],
    }
  },
}

export type HeatConfig = Base<number[][]> & { weeks: string[]; days?: string[]; unit?: string }
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const cap = (u: string) => u[0]!.toUpperCase() + u.slice(1)
export const heat: Form<HeatConfig> = {
  kind: 'heatmap',
  ramp: 0,
  table: c => tableOf(['Week', ...(c.days ?? DAYS)], c.data.map((w, i) => [c.weeks[i]!, ...w])),
  summary: c => { const all = c.data.flat(); return `${c.data.length} weeks, ${num(sum(all))} ${c.unit ?? 'events'} in total, ${num(Math.max(...all))} at most in a day.` },
  plot(c, W, x) {
    const unit = c.unit ?? 'events', days = c.days ?? DAYS, max = Math.max(...c.data.flat()), bucket = (v: number) => (v === 0 ? 0 : Math.min(5, 1 + Math.floor((v / (max + 1)) * 5)))
    const all = c.data.length, ml = 34, mt = 18, gap = 3
    // narrow: the most recent weeks that fit at ≥ 10px; the table view keeps every week
    const off = Math.max(0, all - Math.floor((W - ml) / (10 + gap))), n = all - off, cell = Math.max(10, Math.min(26, (W - ml) / n - gap)), H = Math.ceil(mt + days.length * (cell + gap) + 4), r = Math.min(4, x.r), show = labelWindow(n, Math.max(2, Math.floor((W - ml) / 56)))
    return {
      h: H,
      body: [
        s('g', { class: 'axis', 'aria-hidden': 'true' },
          days.map((d, j) => j % 2 === 0 && s('text', { x: ml - 8, y: mt + j * (cell + gap) + cell * 0.7, 'text-anchor': 'end' }, d)),
          c.weeks.slice(off).map((w, i) => { const end = i === n - 1 && i > 0; return show.has(i) && s('text', { x: ml + i * (cell + gap), y: mt - 6, 'text-anchor': end ? 'end' : 'start', dx: end ? cell : undefined }, w) })),
        c.data.map((w, i) => i >= off && w.map((v, j) => mark('rect', i, j, `${c.weeks[i]} ${days[j]}: ${v} ${unit}`, { class: 'cell', style: `--_dc:${seq(bucket(v))};--i:${i - off}`, x: ml + (i - off) * (cell + gap), y: mt + j * (cell + gap), width: cell, height: cell, rx: r }))),
      ],
      tip: (i, j) => ({ title: `${c.weeks[i]} · ${days[j]}`, rows: [[seq(bucket(c.data[i]![j]!)), cap(unit), String(c.data[i]![j])]] }),
    }
  },
}

export type TileConfig = Base<{ id: string; value: number }[]> & { tiles?: string; unit?: string }
/** The US as an 11-column tile grid: rows by `|`, cells by `,`. */
export const US_TILES = 'AK,,,,,,,,,,ME|,,,,,,,,,VT,NH|WA,ID,MT,ND,MN,IL,WI,MI,NY,RI,MA|OR,NV,WY,SD,IA,IN,OH,PA,NJ,CT,|CA,UT,CO,NE,MO,KY,WV,VA,MD,DE,|,AZ,NM,KS,AR,TN,NC,SC,DC,,|,,,OK,LA,MS,AL,GA,,,|HI,,,TX,,,,,FL,,'
export const tile: Form<TileConfig> = {
  kind: 'tile map',
  ramp: 1,
  table: c => tableOf(['Tile', c.unit ?? 'Value'], [...c.data].sort((a, b) => b.value - a.value).map(d => [d.id, d.value])),
  summary: c => { const a = [...c.data].sort((p, q) => q.value - p.value); return `${a.length} tiles; the highest is ${a[0]!.id} at ${num(a[0]!.value)}.` },
  plot(c, W) {
    const L = (c.tiles ?? US_TILES).split('|').map(r => r.split(',')), cols = Math.max(...L.map(r => r.length)), cs = Math.min(30, (W - 4) / cols - 2), g = 2, by = new Map(c.data.map(d => [d.id, d.value])), max = Math.max(...c.data.map(d => d.value))
    const b = (v: number) => Math.min(5, 1 + Math.floor((v / (max + 1)) * 5)), ox = (W - cols * (cs + g)) / 2
    let k = 0
    return {
      h: Math.ceil(L.length * (cs + g)),
      body: L.map((r, ri) => r.map((id, ci) => {
        if (!id) return null
        const v = by.get(id) ?? 0, bucket = b(v)
        return [mark('rect', k++, 0, `${id}: ${v}${c.unit ? ` ${c.unit}` : ''}`, { class: 'cell', style: `--_dc:${seq(bucket)}`, x: ci * (cs + g) + ox, y: ri * (cs + g), width: cs, height: cs, rx: 3 }),
          s('text', { class: 'lab', style: `${halo};font-size:9px`, x: ci * (cs + g) + ox + cs / 2, y: ri * (cs + g) + cs / 2 + 3, 'text-anchor': 'middle' }, id)]
      })),
    }
  },
}
