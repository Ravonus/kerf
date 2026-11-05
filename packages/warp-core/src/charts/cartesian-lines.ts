import { anno, grid, halo, mark, refLine, xLabels, yLabels } from './marks'
import { barPath, clamp, f1, lin, monotone, niceTicks, num, sum } from './math'
import { s } from './scene'
import { tableOf, type Form, type TipRow } from './types'
import {
  labels,
  seriesOf,
  legendOf,
  say,
  crossAt,
  type LineConfig,
  type BarConfig,
} from './cartesian-common'

/** Line and area charts. */
export const line: Form<LineConfig> = {
  kind: 'line chart',
  swatch: 'line',
  legend: (c) => (c.series.length > 1 ? legendOf(c) : []),
  table: (c) =>
    tableOf(
      [c.xName ?? c.x, ...seriesOf(c).map((v) => v.name)],
      labels(c).map((l, i) => [l, ...seriesOf(c).map((v) => (c.format ?? num)(v.values[i]!))]),
    ),
  summary: say,
  plot(c, W, x) {
    const H = W < 480 ? 210 : 270,
      f = c.format ?? num,
      fa = c.axisFormat ?? f,
      X = labels(c),
      n = X.length
    const vis = seriesOf(c).filter((v) => !x.hidden.has(v.i)),
      all = vis.flatMap((v) => v.values)
    const top = Math.max(...all, ...(c.references ?? []).map((r) => r.y))
    const ticks = niceTicks(
      c.zero ? 0 : Math.min(...all) * 0.92,
      top * (c.headroom ?? 1.04),
      H < 240 ? 3 : 4,
    )
    const direct = W >= 560 && vis.length <= 4 && c.direct !== false
    const ml = 8 + Math.max(...ticks.map((t) => fa(t).length)) * 6.6,
      mr = direct ? 92 : 14,
      mt = 14,
      mb = 26
    const px = lin(0, n - 1, ml, W - mr),
      py = lin(ticks[0]!, ticks[ticks.length - 1]!, H - mb, mt)
    const ends = vis.map((v) => ({ i: v.i, y: py(v.values[n - 1]!) + 4 })).sort((a, b) => a.y - b.y)
    ends.forEach((e, k) => {
      if (k && e.y - ends[k - 1]!.y < 14) e.y = ends[k - 1]!.y + 14
    })
    const index = (l: string) => Math.max(0, X.indexOf(l))
    return {
      h: H,
      body: [
        s(
          'defs',
          {},
          vis.map((v) =>
            s(
              'linearGradient',
              { id: `${x.id}-g${v.i}`, x1: 0, y1: 0, x2: 0, y2: 1 },
              s('stop', { offset: 0, class: 'g-top', style: `stop-color:${v.color}` }),
              s('stop', { offset: 1, class: 'g-bot', style: `stop-color:${v.color}` }),
            ),
          ),
        ),
        grid(ticks, py, ml, W - mr),
        s(
          'g',
          { class: 'axis', 'aria-hidden': 'true' },
          yLabels(ticks, py, ml, fa),
          xLabels(X, px, H - 7, 58, W - ml - mr, true),
        ),
        W >= 420 &&
          c.annotations?.map((a) =>
            anno(
              px(index(a.x)),
              mt,
              H - mb,
              a.label,
              px(index(a.x)) - 6,
              mt + 12,
              'end',
              a.band && [px(index(a.band[0])), px(index(a.band[1]))],
            ),
          ),
        c.references?.map((r) => refLine(ml, W - mr, py(r.y), r.label, ml + 4)),
        lineSeries({ vis, px, py, n, x, c, H, mb, X, f, direct, ends }),
        s('line', { class: 'cross', x1: 0, x2: 0, y1: mt, y2: H - mb }),
      ],
      pick: (sx) =>
        `[data-mark][data-xi="${clamp(Math.round((sx - ml) / ((W - ml - mr) / (n - 1))), 0, n - 1)}"]`,
      tip: (i) => ({ title: X[i]!, rows: vis.map((v) => [v.color, v.name, f(v.values[i]!)]) }),
      on: crossAt,
    }
  },
}

/** Bar charts: grouped, stacked or percent. */
export const bar: Form<BarConfig> = {
  kind: 'bar chart',
  legend: legendOf,
  table: (c) => {
    const list = seriesOf(c),
      f = c.format ?? num
    return tableOf(
      [c.xName ?? c.x, ...list.map((v) => v.name), 'Total'],
      labels(c).map((l, i) => [
        l,
        ...list.map((v) => f(v.values[i]!)),
        f(sum(list.map((v) => v.values[i]!))),
      ]),
    )
  },
  summary: say,
  plot(c, W, x) {
    const f = c.format ?? num,
      fa = c.axisFormat ?? f,
      X = labels(c),
      n = X.length,
      mode = c.layout ?? 'grouped',
      S = seriesOf(c).filter((v) => !x.hidden.has(v.i))
    const totals = X.map((_, i) => sum(S.map((v) => v.values[i]!)))
    const tip = (i: number, si: number) => ({
      title: `${X[i]} · ${f(totals[i]!)}`,
      rows: S.map((v): TipRow => [v.color, v.name, f(v.values[i]!), v.i !== si]),
    })
    if (mode === 'percent') return percentBars({ W, n, X, S, totals, tip })
    const H = W < 480 ? 220 : 270,
      K = S.length
    const ticks = niceTicks(
      0,
      (mode === 'stacked' ? Math.max(...totals) : Math.max(...S.flatMap((v) => v.values))) * 1.05,
      H < 240 ? 3 : 4,
    )
    const ml = 10 + Math.max(...ticks.map((t) => fa(t).length)) * 6.6,
      mr = 8,
      mt = 12,
      mb = 26
    const y = lin(0, ticks[ticks.length - 1]!, H - mb, mt),
      band = (W - ml - mr) / n
    let k = 0
    return {
      h: H,
      tip,
      body: [
        grid(ticks, y, ml, W - mr),
        s(
          'g',
          { class: 'axis', 'aria-hidden': 'true' },
          yLabels(ticks, y, ml, fa),
          xLabels(X, (i) => ml + band * (i + 0.5), H - 7, 44, W - ml - mr),
        ),
        S.map((v, si) =>
          s(
            'g',
            { 'data-series': v.i, style: `--_dc:${v.color}` },
            v.values.map((val, i) => {
              let bx,
                bw,
                by,
                bh,
                top = true
              if (mode === 'grouped') {
                const gw = Math.min(band * 0.74, K * 22 + (K - 1) * 2)
                bw = (gw - (K - 1) * 2) / K
                bx = ml + band * i + (band - gw) / 2 + si * (bw + 2)
                by = y(val)
                bh = y(0) - by
              } else {
                bw = Math.min(band * 0.56, 30)
                bx = ml + band * i + (band - bw) / 2
                const below = sum(S.slice(0, si).map((o) => o.values[i]!))
                by = y(below + val)
                bh = y(below) - by - (si ? 2 : 0)
                top = si === K - 1
              }
              return mark('path', i, v.i, `${X[i]}, ${v.name}: ${f(val)}`, {
                class: 's-bar',
                style: `--i:${k++}`,
                d: barPath(bx, by, bw, Math.max(0.5, bh), top ? x.r : 0),
              })
            }),
          ),
        ),
      ],
    }
  },
}

function lineSeries({
  vis,
  px,
  py,
  n,
  x,
  c,
  H,
  mb,
  X,
  f,
  direct,
  ends,
}: {
  vis: ReturnType<typeof seriesOf>
  px: (v: number) => number
  py: (v: number) => number
  n: number
  x: { id: string }
  c: LineConfig
  H: number
  mb: number
  X: string[]
  f: (v: number) => string
  direct: boolean
  ends: { i: number; y: number }[]
}) {
  return vis.map((v, k) => {
    const pts = v.values.map((val, i) => [px(i), py(val)]),
      d = monotone(pts),
      last = pts[n - 1]!
    return s(
      'g',
      { 'data-series': v.i, style: `--_dc:${v.color};--i:${k}` },
      c.area !== false &&
        s('path', {
          class: 's-area',
          fill: `url(#${x.id}-g${v.i})`,
          d: `${d}L${f1(px(n - 1))},${H - mb}L${f1(px(0))},${H - mb}Z`,
        }),
      s('path', { class: 's-line', pathLength: 1, 'stroke-dasharray': 1, d }),
      v.values.map((val, i) =>
        mark('circle', i, v.i, `${X[i]}, ${v.name}: ${f(val)}`, {
          class: 's-pt',
          cx: f1(pts[i]![0]!),
          cy: f1(pts[i]![1]!),
          r: 4,
        }),
      ),
      direct && [
        s('circle', {
          class: 's-pt',
          cx: f1(last[0]!),
          cy: f1(last[1]!),
          r: 3.5,
          style: 'r:3.5px',
          'aria-hidden': 'true',
        }),
        s(
          'text',
          {
            class: 's-end',
            x: last[0]! + 8,
            y: ends.find((e) => e.i === v.i)!.y,
            'aria-hidden': 'true',
          },
          v.name,
        ),
      ],
    )
  })
}

function percentBars({
  W,
  n,
  X,
  S,
  totals,
  tip,
}: {
  W: number
  n: number
  X: string[]
  S: ReturnType<typeof seriesOf>
  totals: number[]
  tip: (i: number, si: number) => { title: string; rows: TipRow[] }
}) {
  const H = W < 420 ? 190 : 220,
    ml = 48,
    bh = Math.min(26, (H - 20) / n - 10),
    px = lin(0, 100, ml, W - 4)
  return {
    h: H,
    tip,
    body: [
      X.map((reg, ri) => {
        let acc = 0
        const y = 6 + ri * (bh + 12)
        return [
          s('text', { class: 'lab', x: ml - 8, y: y + bh / 2 + 4, 'text-anchor': 'end' }, reg),
          S.map((v, k) => {
            const p = (v.values[ri]! / totals[ri]!) * 100,
              x0 = px(acc),
              w = px(acc + p) - x0 - (k < S.length - 1 ? 2 : 0),
              edge = k === 0 || k === S.length - 1
            acc += p
            return [
              mark('rect', ri, v.i, `${reg}, ${v.name}: ${Math.round(p)}%`, {
                class: 's-rect',
                style: `--_dc:${v.color};stroke:none`,
                x: x0,
                y,
                width: Math.max(0.5, w),
                height: bh,
                rx: edge ? 3 : 0,
              }),
              w > 30 &&
                s(
                  'text',
                  { class: 'lab', x: x0 + 6, y: y + bh / 2 + 4, style: halo },
                  `${Math.round(p)}%`,
                ),
            ]
          }),
        ]
      }),
      s(
        'g',
        { class: 'axis', 'aria-hidden': 'true' },
        [0, 50, 100].map((t) =>
          s(
            'text',
            { x: px(t), y: H - 4, 'text-anchor': t ? (t === 100 ? 'end' : 'middle') : 'start' },
            `${t}%`,
          ),
        ),
      ),
    ],
  }
}
