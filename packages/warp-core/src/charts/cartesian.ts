// The forms on x and y axes (06 §12, specimen 05 and 10). Each is a `Form`: a pure layout from config and width.
import { anno, axisY, grid, halo, mark, refLine, xLabels, yLabels } from './marks'
import { barPath, clamp, color, f1, lin, monotone, niceTicks, num, quantile, sum } from './math'
import { s } from './scene'
import { tableOf, type Base, type Fmt, type Form, type LegendItem, type TipRow } from './types'

export type Row = Record<string, any>
export type SeriesDef = string | { key: string; name?: string; color?: string }
export type Annotation = { x: string; label: string; band?: [string, string] }
export type Reference = { y: number; label: string }
export type Cartesian = Base<Row[]> & { x: string; series: SeriesDef[]; format?: Fmt; axisFormat?: Fmt; xName?: string }
export type LineConfig = Cartesian & { area?: boolean; zero?: boolean; direct?: boolean; headroom?: number; annotations?: Annotation[]; references?: Reference[] }
export type BarLayout = 'grouped' | 'stacked' | 'percent'
export type BarConfig = Cartesian & { layout?: BarLayout }
export type ComboConfig = Base<Row[]> & { x: string; bar: SeriesDef; line?: SeriesDef; window?: number; format?: Fmt; axisFormat?: Fmt; xName?: string }

const labels = (c: { data: Row[]; x: string }) => c.data.map(r => String(r[c.x]))
const def = (d: SeriesDef, i: number) => (typeof d === 'string' ? { key: d, name: d, i, color: color(i) } : { key: d.key, name: d.name ?? d.key, i, color: d.color ?? color(i) })
const seriesOf = (c: Cartesian) => c.series.map((d, i) => { const e = def(d, i); return { ...e, values: c.data.map(r => Number(r[e.key])) } })
const legendOf = (c: Cartesian): LegendItem[] => c.series.map(def).map(({ name, color }) => ({ name, color }))
const say = (c: Cartesian) => {
  const f = c.format ?? num, list = seriesOf(c), t = list[0]!
  return `${list.length} series over ${c.data.length} points. ${t.name} goes from ${f(t.values[0]!)} to ${f(t.values[t.values.length - 1]!)}.`
}
const crossAt = (el: Element | null, svg: Element) => {
  if (!el) return
  const x = el.getAttribute('cx')!, cross = svg.querySelector('.cross')!, xi = el.getAttribute('data-xi')
  cross.setAttribute('x1', x)
  cross.setAttribute('x2', x)
  for (const m of svg.querySelectorAll('[data-mark]')) m.toggleAttribute('data-active', m.getAttribute('data-xi') === xi)
}

export const line: Form<LineConfig> = {
  kind: 'line chart',
  swatch: 'line',
  legend: c => (c.series.length > 1 ? legendOf(c) : []),
  table: c => tableOf([c.xName ?? c.x, ...seriesOf(c).map(s => s.name)], labels(c).map((l, i) => [l, ...seriesOf(c).map(v => (c.format ?? num)(v.values[i]!))])),
  summary: say,
  plot(c, W, x) {
    const H = W < 480 ? 210 : 270, f = c.format ?? num, fa = c.axisFormat ?? f, X = labels(c), n = X.length
    const vis = seriesOf(c).filter(v => !x.hidden.has(v.i)), all = vis.flatMap(v => v.values)
    const top = Math.max(...all, ...(c.references ?? []).map(r => r.y))
    const ticks = niceTicks(c.zero ? 0 : Math.min(...all) * 0.92, top * (c.headroom ?? 1.04), H < 240 ? 3 : 4)
    const direct = W >= 560 && vis.length <= 4 && c.direct !== false
    const ml = 8 + Math.max(...ticks.map(t => fa(t).length)) * 6.6, mr = direct ? 92 : 14, mt = 14, mb = 26
    const px = lin(0, n - 1, ml, W - mr), py = lin(ticks[0]!, ticks[ticks.length - 1]!, H - mb, mt)
    const ends = vis.map(v => ({ i: v.i, y: py(v.values[n - 1]!) + 4 })).sort((a, b) => a.y - b.y)
    ends.forEach((e, k) => { if (k && e.y - ends[k - 1]!.y < 14) e.y = ends[k - 1]!.y + 14 })
    const index = (l: string) => Math.max(0, X.indexOf(l))
    return {
      h: H,
      body: [
        s('defs', {}, vis.map(v => s('linearGradient', { id: `${x.id}-g${v.i}`, x1: 0, y1: 0, x2: 0, y2: 1 }, s('stop', { offset: 0, class: 'g-top', style: `stop-color:${v.color}` }), s('stop', { offset: 1, class: 'g-bot', style: `stop-color:${v.color}` })))),
        grid(ticks, py, ml, W - mr),
        s('g', { class: 'axis', 'aria-hidden': 'true' }, yLabels(ticks, py, ml, fa), xLabels(X, px, H - 7, 58, W - ml - mr, true)),
        W >= 420 && c.annotations?.map(a => anno(px(index(a.x)), mt, H - mb, a.label, px(index(a.x)) - 6, mt + 12, 'end', a.band && [px(index(a.band[0])), px(index(a.band[1]))])),
        c.references?.map(r => refLine(ml, W - mr, py(r.y), r.label, ml + 4)),
        vis.map((v, k) => {
          const pts = v.values.map((val, i) => [px(i), py(val)]), d = monotone(pts), last = pts[n - 1]!
          return s('g', { 'data-series': v.i, style: `--_dc:${v.color};--i:${k}` },
            c.area !== false && s('path', { class: 's-area', fill: `url(#${x.id}-g${v.i})`, d: `${d}L${f1(px(n - 1))},${H - mb}L${f1(px(0))},${H - mb}Z` }),
            s('path', { class: 's-line', pathLength: 1, 'stroke-dasharray': 1, d }),
            v.values.map((val, i) => mark('circle', i, v.i, `${X[i]}, ${v.name}: ${f(val)}`, { class: 's-pt', cx: f1(pts[i]![0]!), cy: f1(pts[i]![1]!), r: 4 })),
            direct && [s('circle', { class: 's-pt', cx: f1(last[0]!), cy: f1(last[1]!), r: 3.5, style: 'r:3.5px', 'aria-hidden': 'true' }), s('text', { class: 's-end', x: last[0]! + 8, y: ends.find(e => e.i === v.i)!.y, 'aria-hidden': 'true' }, v.name)])
        }),
        s('line', { class: 'cross', x1: 0, x2: 0, y1: mt, y2: H - mb }),
      ],
      pick: sx => `[data-mark][data-xi="${clamp(Math.round((sx - ml) / ((W - ml - mr) / (n - 1))), 0, n - 1)}"]`,
      tip: i => ({ title: X[i]!, rows: vis.map(v => [v.color, v.name, f(v.values[i]!)]) }),
      on: crossAt,
    }
  },
}

export const bar: Form<BarConfig> = {
  kind: 'bar chart',
  legend: legendOf,
  table: c => {
    const list = seriesOf(c), f = c.format ?? num
    return tableOf([c.xName ?? c.x, ...list.map(s => s.name), 'Total'], labels(c).map((l, i) => [l, ...list.map(v => f(v.values[i]!)), f(sum(list.map(v => v.values[i]!)))]))
  },
  summary: say,
  plot(c, W, x) {
    const f = c.format ?? num, fa = c.axisFormat ?? f, X = labels(c), n = X.length, mode = c.layout ?? 'grouped', S = seriesOf(c).filter(v => !x.hidden.has(v.i))
    const totals = X.map((_, i) => sum(S.map(v => v.values[i]!)))
    const tip = (i: number, si: number) => ({ title: `${X[i]} · ${f(totals[i]!)}`, rows: S.map((v): TipRow => [v.color, v.name, f(v.values[i]!), v.i !== si]) })
    if (mode === 'percent') {
      const H = W < 420 ? 190 : 220, ml = 48, bh = Math.min(26, (H - 20) / n - 10), px = lin(0, 100, ml, W - 4)
      return {
        h: H, tip,
        body: [
          X.map((reg, ri) => {
            let acc = 0
            const y = 6 + ri * (bh + 12)
            return [s('text', { class: 'lab', x: ml - 8, y: y + bh / 2 + 4, 'text-anchor': 'end' }, reg), S.map((v, k) => {
              const p = (v.values[ri]! / totals[ri]!) * 100, x0 = px(acc), w = px(acc + p) - x0 - (k < S.length - 1 ? 2 : 0), edge = k === 0 || k === S.length - 1
              acc += p
              return [mark('rect', ri, v.i, `${reg}, ${v.name}: ${Math.round(p)}%`, { class: 's-rect', style: `--_dc:${v.color};stroke:none`, x: x0, y, width: Math.max(0.5, w), height: bh, rx: edge ? 3 : 0 }),
                w > 30 && s('text', { class: 'lab', x: x0 + 6, y: y + bh / 2 + 4, style: halo }, `${Math.round(p)}%`)]
            })]
          }),
          s('g', { class: 'axis', 'aria-hidden': 'true' }, [0, 50, 100].map(t => s('text', { x: px(t), y: H - 4, 'text-anchor': t ? (t === 100 ? 'end' : 'middle') : 'start' }, `${t}%`))),
        ],
      }
    }
    const H = W < 480 ? 220 : 270, K = S.length
    const ticks = niceTicks(0, (mode === 'stacked' ? Math.max(...totals) : Math.max(...S.flatMap(v => v.values))) * 1.05, H < 240 ? 3 : 4)
    const ml = 10 + Math.max(...ticks.map(t => fa(t).length)) * 6.6, mr = 8, mt = 12, mb = 26
    const y = lin(0, ticks[ticks.length - 1]!, H - mb, mt), band = (W - ml - mr) / n
    let k = 0
    return {
      h: H, tip,
      body: [
        grid(ticks, y, ml, W - mr),
        s('g', { class: 'axis', 'aria-hidden': 'true' }, yLabels(ticks, y, ml, fa), xLabels(X, i => ml + band * (i + 0.5), H - 7, 44, W - ml - mr)),
        S.map((v, si) => s('g', { 'data-series': v.i, style: `--_dc:${v.color}` }, v.values.map((val, i) => {
          let bx, bw, by, bh, top = true
          if (mode === 'grouped') {
            const gw = Math.min(band * 0.74, K * 22 + (K - 1) * 2)
            bw = (gw - (K - 1) * 2) / K
            bx = ml + band * i + (band - gw) / 2 + si * (bw + 2)
            by = y(val)
            bh = y(0) - by
          } else {
            bw = Math.min(band * 0.56, 30)
            bx = ml + band * i + (band - bw) / 2
            const below = sum(S.slice(0, si).map(o => o.values[i]!))
            by = y(below + val)
            bh = y(below) - by - (si ? 2 : 0)
            top = si === K - 1
          }
          return mark('path', i, v.i, `${X[i]}, ${v.name}: ${f(val)}`, { class: 's-bar', style: `--i:${k++}`, d: barPath(bx, by, bw, Math.max(0.5, bh), top ? x.r : 0) })
        }))),
      ],
    }
  },
}

const average = (v: number[], n: number) => v.map((_, i) => (i < n - 1 ? null : sum(v.slice(i - n + 1, i + 1)) / n))
const comboOf = (c: ComboConfig) => {
  const b = def(c.bar, 0), n = c.window ?? 3, values = c.data.map(r => Number(r[b.key])), l = c.line ? def(c.line, 2) : { key: '', name: `${n}-point average`, i: 2, color: color(2) }
  return { b, l, values, line: c.line ? c.data.map(r => Number(r[l.key])) : average(values, n) }
}
export const combo: Form<ComboConfig> = {
  kind: 'combo chart',
  swatch: 'line',
  legend: c => { const { b, l } = comboOf(c); return [{ name: b.name, color: b.color }, { name: l.name, color: l.color }] },
  table: c => {
    const { b, l, values, line } = comboOf(c), f = c.format ?? num
    return tableOf([c.xName ?? c.x, b.name, l.name], labels(c).map((m, i) => [m, f(values[i]!), line[i] === null ? '–' : f(line[i]!)]))
  },
  summary: c => { const { b, values } = comboOf(c), f = c.format ?? num; return `${b.name} moved from ${f(values[0]!)} to ${f(values[values.length - 1]!)}, with its trend on the same axis.` },
  plot(c, W, x) {
    const H = W < 420 ? 190 : 220, X = labels(c), f = c.format ?? num, fa = c.axisFormat ?? f, { b, l, values, line } = comboOf(c), ml = 40, mb = 22, mt = 8
    const t = niceTicks(0, Math.max(...values, ...line.map(v => v ?? 0)), 3), y = lin(0, t[t.length - 1]!, H - mb, mt), band = (W - ml - 4) / X.length
    const pts = line.map((m, i) => m !== null && [ml + band * (i + 0.5), y(m)]).filter(Boolean) as number[][]
    return {
      h: H,
      body: [
        axisY(t, y, ml, W - 4, fa),
        !x.hidden.has(0) && s('g', { 'data-series': 0, style: `--_dc:${b.color}` }, values.map((v, i) => mark('path', i, 0, `${X[i]}: ${f(v)}${line[i] !== null ? `, average ${f(line[i]!)}` : ''}`, { class: 's-bar', style: `--i:${i}`, d: barPath(ml + band * i + band * 0.2, y(v), band * 0.6, y(0) - y(v), 3) }))),
        !x.hidden.has(1) && s('g', { 'data-series': 1, style: `--_dc:${l.color}` }, s('path', { class: 's-line', d: monotone(pts) }), pts.map(p => s('circle', { cx: f1(p[0]!), cy: f1(p[1]!), r: 3, fill: 'var(--warp-color-surface-raised)', stroke: l.color, 'stroke-width': 2 }))),
        s('g', { class: 'axis', 'aria-hidden': 'true' }, xLabels(X, i => ml + band * (i + 0.5), H - 6, 40, W - ml)),
      ],
      tip: i => ({ title: X[i]!, rows: [[b.color, b.name, f(values[i]!)], ...(line[i] !== null ? [[l.color, l.name, f(line[i]!)] as TipRow] : [])] }),
    }
  },
}

export type HistConfig = Base<number[]> & { binWidth: number; format?: Fmt; name?: string }
const binsOf = (c: HistConfig) => {
  const bw = c.binWidth, lo = Math.floor(Math.min(...c.data) / bw) * bw, hi = Math.ceil(Math.max(...c.data) / bw) * bw
  const bins: { x0: number; x1: number; n: number }[] = []
  for (let b = lo; b < hi; b += bw) bins.push({ x0: b, x1: b + bw, n: 0 })
  if (!bins.length) bins.push({ x0: lo, x1: lo + bw, n: 0 })
  for (const v of c.data) bins[Math.min(bins.length - 1, Math.floor((v - lo) / bw))]!.n++
  const sorted = [...c.data].sort((a, b) => a - b)
  return { bins, lo, hi: Math.max(hi, lo + bw), q: (p: number) => quantile(sorted, p) }
}
export const histogram: Form<HistConfig> = {
  kind: 'histogram',
  table: c => { const f = c.format ?? num; return tableOf(['Range', c.name ?? 'Count'], binsOf(c).bins.map(b => [`${f(b.x0)}–${f(b.x1)}`, b.n])) },
  summary: c => { const { q } = binsOf(c), f = c.format ?? num; return `${c.data.length} values. Median ${f(q(0.5))}, p95 ${f(q(0.95))}.` },
  plot(c, W, x) {
    const { bins, lo, hi, q } = binsOf(c), f = c.format ?? num, H = W < 400 ? 190 : 220, ticks = niceTicks(0, Math.max(...bins.map(b => b.n)) * 1.08, 3)
    const ml = 34, mr = 8, mt = 18, mb = 26, px = lin(lo, hi, ml, W - mr), py = lin(0, ticks[ticks.length - 1]!, H - mb, mt), name = c.name ?? 'Count'
    const xt = niceTicks(lo, hi, Math.max(2, Math.floor((W - ml) / 64))).filter(t => t >= lo && t <= hi)
    return {
      h: H,
      body: [
        grid(ticks, py, ml, W - mr),
        s('g', { class: 'axis', 'aria-hidden': 'true' }, ticks.map(t => s('text', { x: ml - 6, y: py(t) + 3.5, 'text-anchor': 'end' }, t)), xt.map(t => s('text', { x: px(t), y: H - 7, 'text-anchor': 'middle' }, f(t)))),
        s('g', { 'data-series': 0, style: `--_dc:${color(0)}` }, bins.map((b, i) => mark('path', i, 0, `${f(b.x0)} to ${f(b.x1)}: ${b.n}`, { class: 's-bar', style: `--i:${i}`, d: barPath(px(b.x0) + 1, py(b.n), px(b.x1) - px(b.x0) - 2, Math.max(0.5, py(0) - py(b.n)), x.r) }))),
        [['p50', q(0.5)], ['p95', q(0.95)]].map(([l, v]) => anno(px(v as number), mt - 6, H - mb, `${l} ${f(v as number)}`, px(v as number) + 5, mt + 2)),
      ],
      tip: i => ({ title: `${f(bins[i]!.x0)}–${f(bins[i]!.x1)}`, rows: [[color(0), name, String(bins[i]!.n)]] }),
    }
  },
}

export type Point = { name: string; x: number; y: number; size?: number }
export type ScatterConfig = Base<{ name: string; points: Point[] }[]> & { xName: string; yName: string; sizeName?: string; format?: Fmt }
const dots = (c: ScatterConfig, x: { hidden: ReadonlySet<number> }) =>
  c.data.flatMap((g, gi) => (x.hidden.has(gi) ? [] : g.points.map(p => ({ ...p, g: g.name, gi })))).sort((a, b) => a.x - b.x)
const scatterTable = (c: ScatterConfig) => tableOf(['Name', 'Group', c.xName, c.yName, ...(c.sizeName ? [c.sizeName] : [])], c.data.flatMap(g => g.points.map(p => [p.name, g.name, p.x, p.y, ...(c.sizeName ? [p.size ?? 0] : [])])))
const scatterLegend = (c: ScatterConfig) => c.data.map((g, i) => ({ name: g.name, color: color(i) }))
const scatterSay = (c: ScatterConfig) => `${c.data.reduce((n, g) => n + g.points.length, 0)} points in ${c.data.length} groups: ${c.xName} against ${c.yName}.`
const scales = (c: ScatterConfig, W: number, H: number, ml: number, mr: number, mt: number, mb: number, n: number) => {
  const all = c.data.flatMap(g => g.points), xt = niceTicks(0, Math.max(...all.map(p => p.x)) * 1.05, n), yt = niceTicks(0, Math.max(...all.map(p => p.y)) * 1.05, 3)
  return { xt, yt, px: lin(0, xt[xt.length - 1]!, ml, W - mr), py: lin(0, yt[yt.length - 1]!, H - mb, mt) }
}

export const scatter: Form<ScatterConfig> = {
  kind: 'scatter plot',
  legend: scatterLegend,
  table: scatterTable,
  summary: scatterSay,
  plot(c, W, x) {
    const H = W < 400 ? 220 : 250, ml = 34, mr = 10, mt = 10, mb = 30, { xt, yt, px, py } = scales(c, W, H, ml, mr, mt, mb, W < 400 ? 3 : 4), f = c.format ?? num, list = dots(c, x)
    return {
      h: H,
      body: [
        s('g', { class: 'grid', 'aria-hidden': 'true' }, yt.map(t => s('line', { x1: ml, x2: W - mr, y1: py(t), y2: py(t), class: t === 0 ? 'zero' : undefined })), xt.map(t => s('line', { y1: mt, y2: H - mb, x1: px(t), x2: px(t), class: t === 0 ? 'zero' : undefined }))),
        s('g', { class: 'axis', 'aria-hidden': 'true' }, yt.map(t => s('text', { x: ml - 6, y: py(t) + 3.5, 'text-anchor': 'end' }, t)), xt.map(t => s('text', { x: px(t), y: H - 12, 'text-anchor': 'middle' }, t)), s('text', { x: W - mr, y: H - 1, 'text-anchor': 'end' }, `${c.xName} →`)),
        c.data.map((g, gi) => !x.hidden.has(gi) && s('g', { 'data-series': gi, class: 'dots', style: `--_dc:${color(gi)};--i:${gi}` }, list.map((p, i) => {
          if (p.gi !== gi) return null
          const X = px(p.x), Y = py(p.y), lab = `${p.name} (${g.name}): ${c.xName} ${f(p.x)}, ${c.yName} ${f(p.y)}`, shape = gi % 3
          if (shape === 1) return mark('rect', i, 0, lab, { class: 's-pt', style: 'r:auto', x: X - 4, y: Y - 4, width: 8, height: 8, rx: 1 })
          if (shape === 2) return mark('path', i, 0, lab, { class: 's-pt', style: 'r:auto', d: `M${f1(X)},${f1(Y - 5.5)}L${f1(X + 5.5)},${f1(Y)}L${f1(X)},${f1(Y + 5.5)}L${f1(X - 5.5)},${f1(Y)}Z` })
          return mark('circle', i, 0, lab, { class: 's-pt', style: 'r:4.5px', cx: f1(X), cy: f1(Y), r: 4.5 })
        }))),
      ],
    }
  },
}

export const bubble: Form<ScatterConfig> = {
  kind: 'bubble chart',
  legend: scatterLegend,
  table: scatterTable,
  summary: scatterSay,
  plot(c, W, x) {
    const H = W < 420 ? 190 : 220, ml = 30, mb = 22, { yt, px, py } = scales(c, W, H, ml, 8, 8, mb, 4), rs = (v: number) => 3 + Math.sqrt(v) * 2.4, f = c.format ?? num
    return {
      h: H,
      body: [
        axisY(yt, py, ml, W - 8),
        c.data.map((g, gi) => !x.hidden.has(gi) && s('g', { 'data-series': gi, style: `--_dc:${color(gi)}` }, [...g.points].sort((a, b) => (b.size ?? 0) - (a.size ?? 0)).map(p => mark('circle', dots(c, x).findIndex(q => q.name === p.name && q.gi === gi), 0, `${p.name}: ${c.xName} ${f(p.x)}, ${c.yName} ${f(p.y)}, ${c.sizeName ?? 'size'} ${f(p.size ?? 0)}`, { class: 's-pt', style: `r:${f1(rs(p.size ?? 0))}px;fill-opacity:.55`, cx: f1(px(p.x)), cy: f1(py(p.y)), r: f1(rs(p.size ?? 0)) })))),
        s('g', { class: 'axis', 'aria-hidden': 'true' }, s('text', { x: W - 8, y: H - 6, 'text-anchor': 'end' }, `${c.xName} →`)),
      ],
    }
  },
}

export type Ohlc = { label: string; open: number; high: number; low: number; close: number }
export type CandleConfig = Base<Ohlc[]> & { variant?: 'candle' | 'ohlc'; format?: Fmt }
const pf = (v: number) => v.toFixed(2)
export const candlestick: Form<CandleConfig> = {
  kind: 'candlestick chart',
  table: c => tableOf(['Day', 'Open', 'High', 'Low', 'Close'], c.data.map(d => [d.label, ...[d.open, d.high, d.low, d.close].map(c.format ?? pf)])),
  summary: c => { const f = c.format ?? pf, a = c.data; return `${a.length} sessions; closed at ${f(a[a.length - 1]!.close)} from an open of ${f(a[0]!.open)}; ${a.filter(d => d.close > d.open).length} up days.` },
  plot(c, W) {
    const H = W < 420 ? 190 : 220, ml = 40, mb = 22, f = c.format ?? pf, C = c.data, t = niceTicks(Math.min(...C.map(d => d.low)), Math.max(...C.map(d => d.high)), 4)
    const y = lin(t[0]!, t[t.length - 1]!, H - mb, 8), band = (W - ml - 4) / C.length, bw = Math.max(2, Math.min(10, band * 0.6))
    const tone = (d: Ohlc) => (d.close >= d.open ? 'var(--warp-color-data-up)' : 'var(--warp-color-data-down)')
    return {
      h: H,
      body: [
        axisY(t, y, ml, W - 4, v => v.toFixed(0)),
        C.map((d, i) => {
          const up = d.close >= d.open, cx = ml + band * (i + 0.5), col = tone(d), label = `${d.label}: open ${f(d.open)}, high ${f(d.high)}, low ${f(d.low)}, close ${f(d.close)}, ${up ? 'up' : 'down'}`
          return s('g', { style: `--_dc:${col}` }, s('line', { class: 's-wick', x1: cx, x2: cx, y1: y(d.high), y2: y(d.low) }), c.variant === 'ohlc'
            ? [s('line', { class: 's-wick', x1: cx - bw / 2, x2: cx, y1: y(d.open), y2: y(d.open) }), s('line', { class: 's-wick', x1: cx, x2: cx + bw / 2, y1: y(d.close), y2: y(d.close) }), mark('rect', i, 0, label, { x: cx - bw / 2, y: y(d.high), width: bw, height: Math.max(1, y(d.low) - y(d.high)), fill: 'transparent' })]
            : mark('rect', i, 0, label, { x: cx - bw / 2, y: y(Math.max(d.open, d.close)), width: bw, height: Math.max(1, Math.abs(y(d.open) - y(d.close))), fill: up ? 'var(--warp-color-surface-raised)' : col, stroke: col, 'stroke-width': 1.25 }))
        }),
        s('g', { class: 'axis', 'aria-hidden': 'true' }, xLabels(C.map(d => d.label), i => ml + band * (i + 0.5), H - 6, 64, W - ml)),
      ],
      tip: i => { const d = C[i]!, col = tone(d); return { title: `${d.label} ${d.close >= d.open ? '▲' : '▼'}`, rows: ([['Open', d.open], ['High', d.high], ['Low', d.low], ['Close', d.close]] as const).map(([l, v]): TipRow => [col, l, f(v)]) } },
    }
  },
}

export type BoxConfig = Base<{ name: string; values: number[] }[]> & { format?: Fmt }
const boxOf = (c: BoxConfig) => c.data.map(g => {
  const v = [...g.values].sort((a, b) => a - b), q1 = quantile(v, 0.25), md = quantile(v, 0.5), q3 = quantile(v, 0.75), iqr = q3 - q1
  const lo = Math.max(v[0]!, q1 - 1.5 * iqr), hi = Math.min(v[v.length - 1]!, q3 + 1.5 * iqr)
  return { n: g.name, q1, md, q3, lo, hi, out: v.filter(x => x > hi || x < lo) }
})
export const box: Form<BoxConfig> = {
  kind: 'box plot',
  table: c => { const f = c.format ?? num; return tableOf(['Group', 'Q1', 'Median', 'Q3', 'Outliers'], boxOf(c).map(g => [g.n, f(g.q1), f(g.md), f(g.q3), g.out.length])) },
  summary: c => { const G = boxOf(c), m = G.map(g => g.md), f = c.format ?? num; return `Medians range from ${f(Math.min(...m))} to ${f(Math.max(...m))} across ${G.length} groups.` },
  plot(c, W) {
    const H = W < 420 ? 190 : 220, ml = 34, mb = 22, G = boxOf(c), f = c.format ?? num, t = niceTicks(0, Math.max(...G.flatMap(g => [g.hi, ...g.out])), 3), y = lin(0, t[t.length - 1]!, H - mb, 8), band = (W - ml) / G.length, bw = Math.min(34, band * 0.45)
    return {
      h: H,
      body: [
        axisY(t, y, ml, W - 4),
        G.map((g, i) => {
          const cx = ml + band * (i + 0.5), wick = (x1: number, x2: number, y1: number, y2: number) => s('line', { class: 's-wick', x1, x2, y1, y2 })
          return [s('g', { style: `--_dc:${color(i)}` }, wick(cx, cx, y(g.hi), y(g.q3)), wick(cx, cx, y(g.q1), y(g.lo)), wick(cx - bw / 4, cx + bw / 4, y(g.hi), y(g.hi)), wick(cx - bw / 4, cx + bw / 4, y(g.lo), y(g.lo)),
            mark('rect', i, 0, `${g.n}: median ${f(g.md)}, IQR ${f(g.q1)}–${f(g.q3)}, ${g.out.length} outliers`, { x: cx - bw / 2, y: y(g.q3), width: bw, height: y(g.q1) - y(g.q3), rx: 3, fill: 'color-mix(in oklab, var(--_dc) 22%, transparent)', stroke: 'var(--_dc)', 'stroke-width': 1.5 }),
            s('line', { x1: cx - bw / 2, x2: cx + bw / 2, y1: y(g.md), y2: y(g.md), stroke: 'var(--_dc)', 'stroke-width': 2.5 }),
            g.out.map((o, k) => s('circle', { cx: cx + ((k * 37) % 9) - 4, cy: y(o), r: 2.5, fill: 'none', stroke: 'var(--_dc)' }))),
          s('text', { class: 'lab-sub', x: cx, y: H - 6, 'text-anchor': 'middle' }, g.n)]
        }),
      ],
    }
  },
}

export type WaterStep = { name: string; value: number; total?: boolean }
export type WaterConfig = Base<WaterStep[]> & { format?: Fmt }
const signed = (v: number, f: Fmt) => (v > 0 ? `+${f(v)}` : `−${f(-v)}`)
export const waterfall: Form<WaterConfig> = {
  kind: 'waterfall chart',
  table: c => { const f = c.format ?? num; return tableOf(['Step', 'Value'], c.data.map(d => [d.name, d.total ? f(d.value) : signed(d.value, f)])) },
  summary: c => { const f = c.format ?? num, up = sum(c.data.filter(d => !d.total && d.value > 0).map(d => d.value)), dn = sum(c.data.filter(d => !d.total && d.value < 0).map(d => -d.value)); return `From ${f(c.data[0]!.value)} to ${f(c.data[c.data.length - 1]!.value)}: +${f(up)} up, −${f(dn)} down.` },
  plot(c, W) {
    const H = W < 420 ? 190 : 220, ml = 38, mb = 34, S = c.data, f = c.format ?? num
    let top = 0, run = 0
    for (const d of S) { run = d.total ? d.value : run + d.value; top = Math.max(top, run) }
    const t = niceTicks(0, top, 3), y = lin(0, t[t.length - 1]!, H - mb, 8), band = (W - ml) / S.length, bw = Math.min(40, band * 0.6)
    run = 0
    return {
      h: H,
      body: [axisY(t, y, ml, W - 4), S.map((d, i) => {
        const a = d.total ? 0 : run, b = d.total ? d.value : run + d.value, v = d.value
        run = b
        const x = ml + band * i + (band - bw) / 2, hi = y(Math.max(a, b)), h = Math.abs(y(a) - y(b)), col = d.total ? 'var(--warp-color-neutral-solid)' : v > 0 ? 'var(--warp-color-data-up)' : 'var(--warp-color-data-down)', word = d.name.split(' ')[0]!
        return [mark('path', i, 0, `${d.name}: ${d.total ? f(v) : `${v > 0 ? 'up' : 'down'} ${f(Math.abs(v))}`}`, { style: `fill:${col}`, d: barPath(x, hi, bw, Math.max(1, h), v < 0 && !d.total ? 0 : 3) }),
          i < S.length - 1 && s('line', { x1: x + bw, x2: x + band, y1: y(run), y2: y(run), stroke: 'var(--warp-color-border-strong)', 'stroke-dasharray': '2 2' }),
          s('text', { class: 'lab', x: x + bw / 2, y: hi - 5, 'text-anchor': 'middle' }, d.total ? f(v) : `${v > 0 ? '▲ ' : '▼ '}${f(Math.abs(v))}`),
          s('text', { class: 'lab-sub', x: x + bw / 2, y: H - 18, 'text-anchor': 'middle' }, band < 64 && word.length > 5 ? `${d.name.slice(0, 4)}.` : word)]
      })],
    }
  },
}

export type StreamConfig = Base<number[]> & { domain: [number, number]; ticks?: number[]; reference?: Reference; unit?: string; paused?: boolean; format?: Fmt; span?: string }
export const stream: Form<StreamConfig> = {
  kind: 'streaming line chart',
  live: true,
  table: c => tableOf([`Points ago`, c.unit ?? 'Value'], c.paused ? c.data.map((v, i): [number, number] => [c.data.length - 1 - i, Math.round(v)]).reverse() : []),
  summary: c => {
    const u = c.unit ? ` ${c.unit}` : '', last = c.data[c.data.length - 1]!
    return c.paused ? `Paused. Latest ${Math.round(last)}${u}; window range ${Math.round(Math.min(...c.data))}–${Math.round(Math.max(...c.data))}.` : `Live: ${c.title} over the last ${c.data.length} points, between ${c.domain[0]} and ${c.domain[1]}. Pause to read the latest value.`
  },
  plot(c, W) {
    const H = 200, ml = 34, mr = 54, mt = 10, mb = 22, n = c.data.length, px = lin(0, n - 1, ml, W - mr), py = lin(c.domain[0], c.domain[1], H - mb, mt), [d0, d1] = c.domain
    const ticks = c.ticks ?? niceTicks(d0, d1, 3).filter(t => t >= d0 && t <= d1), pts = c.data.map((v, i) => [px(i), py(v)]), last = pts[n - 1]!, val = Math.round(c.data[n - 1]!), ref = c.reference
    return {
      h: H,
      body: [
        axisY(ticks, py, ml, W - mr),
        ref && refLine(ml, W - mr, py(ref.y), ref.label, W - mr - 4, 'end'),
        s('g', { style: `--_dc:${color(0)}` }, s('path', { class: 's-line', d: monotone(pts) }), s('circle', { class: 's-pt', cx: f1(last[0]!), cy: f1(last[1]!), r: 4, style: 'r:4px' }), s('text', { class: 's-end', x: last[0]! + 8, y: f1(last[1]! + 4) }, val)),
        s('g', { class: 'axis', 'aria-hidden': 'true' }, s('text', { x: ml, y: H - 6 }, c.span ?? 'oldest'), s('text', { x: W - mr, y: H - 6, 'text-anchor': 'end' }, 'now')),
        mark('rect', 0, 0, `Latest ${val}${c.unit ? ` ${c.unit}` : ''}`, { x: f1(last[0]! - 6), y: f1(last[1]! - 6), width: 12, height: 12, fill: 'transparent' }),
      ],
    }
  },
}

export type BrushConfig = Base<Row[]> & { x: string; y: string; name?: string; domain: [number, number]; target?: Reference; ticks?: number[]; format?: Fmt; annotation?: string; gap?: number }
const MIN = 10
export const brush: Form<BrushConfig> = {
  kind: 'line chart with brush',
  table: c => { const f = c.format ?? num, step = Math.max(1, Math.round(c.data.length / 18)); return tableOf([c.x, c.name ?? c.y], c.data.filter((_, i) => i % step === 0).map(r => [String(r[c.x]), f(Number(r[c.y]))])) },
  summary: c => { const f = c.format ?? num, v = c.data.map(r => Number(r[c.y])), hit = c.target ? v.findIndex(t => t > c.target!.y) : -1; return `${v.length} points from ${f(v[0]!)} to ${f(v[v.length - 1]!)}.${hit >= 0 ? ` ${c.target!.label} was first crossed at ${c.data[hit]![c.x]}.` : ''}` },
  plot(c, W, x) {
    const v = c.data.map(r => Number(r[c.y])), N = v.length, X = labels(c), f = c.format ?? num, H = W < 420 ? 250 : 290
    const view = (x.view ??= { b0: Math.max(0, N - Math.ceil(N / 3)), b1: N - 1 }), b0 = Math.min(view.b0, N - 1), b1 = Math.min(view.b1, N - 1)
    const ml = 36, mr = 12, mt = 12, top = H - 70, ov = [H - 44, H - 6], [d0, d1] = c.domain
    const xs = lin(b0, b1, ml, W - mr), ys = lin(d0, d1, top, mt), xo = lin(0, N - 1, ml, W - mr), yo = lin(d0, d1, ov[1]!, ov[0]!)
    const seg = v.slice(b0, b1 + 1).map((n, k) => [xs(b0 + k), ys(n)]), t = c.target, hit = t ? v.findIndex(n => n > t.y) : -1, name = c.name ?? c.y
    const ticks = c.ticks ?? niceTicks(d0, d1, 2).filter(n => n >= d0 && n <= d1)
    return {
      h: H,
      body: [
        axisY(ticks, ys, ml, W - mr),
        t && refLine(ml, W - mr, ys(t.y), t.label, ml + 4),
        hit >= b0 && hit <= b1 && c.annotation && anno(xs(hit), mt, top, c.annotation, xs(hit) + 5, mt + 10),
        s('g', { style: `--_dc:${color(0)}` }, s('path', { class: 's-line', d: monotone(seg) }), seg.map((p, k) => mark('circle', k, 0, `${X[b0 + k]}: ${f(v[b0 + k]!)} ${name}`, { class: 's-pt', cx: f1(p[0]!), cy: f1(p[1]!), r: 3.5 }))),
        s('g', { class: 'axis', 'aria-hidden': 'true' }, xLabels(X.slice(b0, b1 + 1), k => xs(b0 + k), top + 14, 70, W - ml, true)),
        s('g', { 'aria-hidden': 'true', style: `--_dc:${color(0)}` }, s('path', { d: monotone(v.map((n, i) => [xo(i), yo(n)])), fill: 'none', stroke: 'var(--warp-color-text-subtle)', 'stroke-width': 1 })),
        s('rect', { class: 'brush', 'data-brush': true, x: f1(xo(b0)), y: ov[0]! - 2, width: f1(xo(b1) - xo(b0)), height: ov[1]! - ov[0]! + 4, rx: 3 }),
        ([['b0', b0], ['b1', b1]] as const).map(([k, at]) => s('g', { class: 'brush-hg', 'data-h': k, tabindex: 0, role: 'slider', 'aria-label': k === 'b0' ? 'Window start' : 'Window end', 'aria-valuemin': 0, 'aria-valuemax': N - 1, 'aria-valuenow': at, 'aria-valuetext': X[at] },
          s('rect', { class: 'brush-hit', x: f1(xo(at) - 12), y: ov[0]! - 2, width: 24, height: ov[1]! - ov[0]! + 4 }), s('rect', { class: 'brush-h', x: f1(xo(at) - 4), y: ov[0]! + 6, width: 8, height: ov[1]! - ov[0]! - 12, rx: 2 }))),
      ],
      pick: (px, py) => (py > top ? null : `[data-mark][data-xi="${clamp(Math.round((px - ml) / ((W - ml - mr) / (b1 - b0))), 0, b1 - b0)}"]`),
    }
  },
  behave({ svg, draw, ctx }) {
    const N = () => Number(svg.querySelector('[data-h]')!.getAttribute('aria-valuemax')) + 1
    const set = (h: string, s: number) => { const v = ctx.view; if (h === 'b0') v.b0 = clamp(v.b0 + s, 0, v.b1 - MIN); else v.b1 = clamp(v.b1 + s, v.b0 + MIN, N() - 1); draw() }
    const key = (e: Event) => {
      const k = e as KeyboardEvent, h = (k.target as Element).closest('[data-h]')
      const by = { ArrowRight: 1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[k.key]
      if (!h || !by) return
      k.preventDefault()
      k.stopPropagation()
      set(h.getAttribute('data-h')!, by)
    }
    const down = (e: Event) => {
      const p = e as PointerEvent, t = p.target as Element, h = t.closest('[data-h]')?.getAttribute('data-h'), bar = t.closest('[data-brush]')
      if (!h && !bar) return
      p.preventDefault()
      const r = svg.getBoundingClientRect(), W = Number(svg.getAttribute('width')), v = ctx.view, x0 = p.clientX, a = v.b0, b = v.b1, step = (((W - 48) / (N() - 1)) * r.width) / W
      const move = (m: PointerEvent) => {
        const di = Math.round((m.clientX - x0) / step)
        if (h === 'b0') v.b0 = clamp(a + di, 0, v.b1 - MIN)
        else if (h === 'b1') v.b1 = clamp(b + di, v.b0 + MIN, N() - 1)
        else { v.b0 = clamp(a + di, 0, N() - 1 - (b - a)); v.b1 = v.b0 + (b - a) }
        draw()
      }
      const up = () => { removeEventListener('pointermove', move); removeEventListener('pointerup', up) }
      addEventListener('pointermove', move)
      addEventListener('pointerup', up)
    }
    svg.addEventListener('keydown', key)
    svg.addEventListener('pointerdown', down)
    return () => { svg.removeEventListener('keydown', key); svg.removeEventListener('pointerdown', down) }
  },
}
