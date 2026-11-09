import { anno, axisY, grid, mark, xLabels } from './marks'
import { barPath, color, f1, lin, monotone, niceTicks, num, quantile, sum } from './math'
import { s } from './scene'
import { tableOf, type Base, type Fmt, type Form, type TipRow } from './types'
import { labels, def, type Cells, type ComboConfig } from './cartesian-common'

const average = (v: number[], n: number) =>
  v.map((_, i) => (i < n - 1 ? null : sum(v.slice(i - n + 1, i + 1)) / n))
const comboOf = (c: ComboConfig) => {
  const b = def(c.bar, 0),
    n = c.window ?? 3,
    values = c.data.map((r) => Number((r as Cells)[b.key])),
    l = c.line ? def(c.line, 2) : { key: '', name: `${n}-point average`, i: 2, color: color(2) }
  return {
    b,
    l,
    values,
    mean: c.line ? c.data.map((r) => Number((r as Cells)[l.key])) : average(values, n),
  }
}
/** Bars with a line over them. */
export const combo: Form<ComboConfig> = {
  kind: 'combo chart',
  swatch: 'line',
  legend: (c) => {
    const { b, l } = comboOf(c)
    return [
      { name: b.name, color: b.color },
      { name: l.name, color: l.color },
    ]
  },
  table: (c) => {
    const { b, l, values, mean } = comboOf(c),
      f = c.format ?? num
    return tableOf(
      [c.xName ?? c.x, b.name, l.name],
      labels(c).map((m, i) => [m, f(values[i]!), mean[i] === null ? '–' : f(mean[i]!)]),
    )
  },
  summary: (c) => {
    const { b, values } = comboOf(c),
      f = c.format ?? num
    return `${b.name} moved from ${f(values[0]!)} to ${f(values[values.length - 1]!)}, with its trend on the same axis.`
  },
  plot(c, W, x) {
    const H = W < 420 ? 190 : 220,
      X = labels(c),
      f = c.format ?? num,
      fa = c.axisFormat ?? f,
      { b, l, values, mean } = comboOf(c),
      ml = 40,
      mb = 22,
      mt = 8
    const t = niceTicks(0, Math.max(...values, ...mean.map((v) => v ?? 0)), 3),
      y = lin(0, t[t.length - 1]!, H - mb, mt),
      band = (W - ml - 4) / X.length
    const pts = mean
      .map((m, i) => m !== null && [ml + band * (i + 0.5), y(m)])
      .filter(Boolean) as number[][]
    return {
      h: H,
      body: [
        axisY(t, y, ml, W - 4, fa),
        !x.hidden.has(0) &&
          s(
            'g',
            { 'data-series': 0, style: `--_dc:${b.color}` },
            values.map((v, i) =>
              mark(
                'path',
                i,
                0,
                `${X[i]}: ${f(v)}${mean[i] !== null ? `, average ${f(mean[i]!)}` : ''}`,
                {
                  class: 's-bar',
                  style: `--i:${i}`,
                  d: barPath(
                    { x: ml + band * i + band * 0.2, y: y(v), w: band * 0.6, h: y(0) - y(v) },
                    3,
                  ),
                },
              ),
            ),
          ),
        !x.hidden.has(1) &&
          s(
            'g',
            { 'data-series': 1, style: `--_dc:${l.color}` },
            s('path', { class: 's-line', d: monotone(pts) }),
            pts.map((p) =>
              s('circle', {
                cx: f1(p[0]!),
                cy: f1(p[1]!),
                r: 3,
                fill: 'var(--warp-color-surface-raised)',
                stroke: l.color,
                'stroke-width': 2,
              }),
            ),
          ),
        s(
          'g',
          { class: 'axis', 'aria-hidden': 'true' },
          xLabels(X, (i) => ml + band * (i + 0.5), H - 6, [40, W - ml]),
        ),
      ],
      tip: (i) => ({
        title: X[i]!,
        rows: [
          [b.color, b.name, f(values[i]!)],
          ...(mean[i] !== null ? [[l.color, l.name, f(mean[i]!)] as TipRow] : []),
        ],
      }),
    }
  },
}

/** Config for a histogram: raw values and the width of a bin. */
export type HistConfig = Base<number[]> & {
  binWidth: number
  format?: Fmt | undefined
  name?: string
}
const binsOf = (c: HistConfig) => {
  const bw = c.binWidth,
    lo = Math.floor(Math.min(...c.data) / bw) * bw,
    hi = Math.ceil(Math.max(...c.data) / bw) * bw
  const bins: { x0: number; x1: number; n: number }[] = []
  for (let b = lo; b < hi; b += bw) bins.push({ x0: b, x1: b + bw, n: 0 })
  if (!bins.length) bins.push({ x0: lo, x1: lo + bw, n: 0 })
  for (const v of c.data) bins[Math.min(bins.length - 1, Math.floor((v - lo) / bw))]!.n++
  const sorted = [...c.data].sort((a, b) => a - b)
  return { bins, lo, hi: Math.max(hi, lo + bw), q: (p: number) => quantile(sorted, p) }
}
/** Histograms. */
export const histogram: Form<HistConfig> = {
  kind: 'histogram',
  table: (c) => {
    const f = c.format ?? num
    return tableOf(
      ['Range', c.name ?? 'Count'],
      binsOf(c).bins.map((b) => [`${f(b.x0)}–${f(b.x1)}`, b.n]),
    )
  },
  summary: (c) => {
    const { q } = binsOf(c),
      f = c.format ?? num
    return `${c.data.length} values. Median ${f(q(0.5))}, p95 ${f(q(0.95))}.`
  },
  plot(c, W, x) {
    const { bins, lo, hi, q } = binsOf(c),
      f = c.format ?? num,
      H = W < 400 ? 190 : 220,
      ticks = niceTicks(0, Math.max(...bins.map((b) => b.n)) * 1.08, 3)
    const ml = 34,
      mr = 8,
      mt = 18,
      mb = 26,
      px = lin(lo, hi, ml, W - mr),
      py = lin(0, ticks[ticks.length - 1]!, H - mb, mt),
      name = c.name ?? 'Count'
    const xt = niceTicks(lo, hi, Math.max(2, Math.floor((W - ml) / 64))).filter(
      (t) => t >= lo && t <= hi,
    )
    return {
      h: H,
      body: [
        grid(ticks, py, ml, W - mr),
        s(
          'g',
          { class: 'axis', 'aria-hidden': 'true' },
          ticks.map((t) => s('text', { x: ml - 6, y: py(t) + 3.5, 'text-anchor': 'end' }, t)),
          xt.map((t) => s('text', { x: px(t), y: H - 7, 'text-anchor': 'middle' }, f(t))),
        ),
        s(
          'g',
          { 'data-series': 0, style: `--_dc:${color(0)}` },
          bins.map((b, i) =>
            mark('path', i, 0, `${f(b.x0)} to ${f(b.x1)}: ${b.n}`, {
              class: 's-bar',
              style: `--i:${i}`,
              d: barPath(
                {
                  x: px(b.x0) + 1,
                  y: py(b.n),
                  w: px(b.x1) - px(b.x0) - 2,
                  h: Math.max(0.5, py(0) - py(b.n)),
                },
                x.r,
              ),
            }),
          ),
        ),
        [
          ['p50', q(0.5)],
          ['p95', q(0.95)],
        ].map(([l, v]) =>
          anno(px(v as number), [mt - 6, H - mb], `${l} ${f(v as number)}`, [
            px(v as number) + 5,
            mt + 2,
          ]),
        ),
      ],
      tip: (i) => ({
        title: `${f(bins[i]!.x0)}–${f(bins[i]!.x1)}`,
        rows: [[color(0), name, String(bins[i]!.n)]],
      }),
    }
  },
}

/** One point on a scatter or bubble chart. */
