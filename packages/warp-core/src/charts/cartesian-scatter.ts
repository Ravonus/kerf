import { axisY, mark } from './marks'
import { color, f1, lin, niceTicks, num } from './math'
import { s } from './scene'
import { tableOf, type Base, type Fmt, type Form } from './types'

/** A named point in a scatter plot. */
export type Point = { name: string; x: number; y: number; size?: number }
/** Config for a scatter or bubble chart: named groups of points. */
export type ScatterConfig = Base<{ name: string; points: Point[] }[]> & {
  xName: string
  yName: string
  sizeName?: string
  format?: Fmt | undefined
}
const dots = (c: ScatterConfig, x: { hidden: ReadonlySet<number> }) =>
  c.data
    .flatMap((g, gi) => (x.hidden.has(gi) ? [] : g.points.map((p) => ({ ...p, g: g.name, gi }))))
    .sort((a, b) => a.x - b.x)
const scatterTable = (c: ScatterConfig) =>
  tableOf(
    ['Name', 'Group', c.xName, c.yName, ...(c.sizeName ? [c.sizeName] : [])],
    c.data.flatMap((g) =>
      g.points.map((p) => [p.name, g.name, p.x, p.y, ...(c.sizeName ? [p.size ?? 0] : [])]),
    ),
  )
const scatterLegend = (c: ScatterConfig) =>
  c.data.map((g, i) => ({ name: g.name, color: color(i) }))
const scatterSay = (c: ScatterConfig) =>
  `${c.data.reduce((n, g) => n + g.points.length, 0)} points in ${c.data.length} groups: ${c.xName} against ${c.yName}.`
const scales = (
  c: ScatterConfig,
  W: number,
  H: number,
  ml: number,
  mr: number,
  mt: number,
  mb: number,
  n: number,
) => {
  const all = c.data.flatMap((g) => g.points),
    xt = niceTicks(0, Math.max(...all.map((p) => p.x)) * 1.05, n),
    yt = niceTicks(0, Math.max(...all.map((p) => p.y)) * 1.05, 3)
  return {
    xt,
    yt,
    px: lin(0, xt[xt.length - 1]!, ml, W - mr),
    py: lin(0, yt[yt.length - 1]!, H - mb, mt),
  }
}

/** Scatter plots. */
export const scatter: Form<ScatterConfig> = {
  kind: 'scatter plot',
  legend: scatterLegend,
  table: scatterTable,
  summary: scatterSay,
  plot(c, W, x) {
    const H = W < 400 ? 220 : 250,
      ml = 34,
      mr = 10,
      mt = 10,
      mb = 30,
      { xt, yt, px, py } = scales(c, W, H, ml, mr, mt, mb, W < 400 ? 3 : 4),
      f = c.format ?? num,
      list = dots(c, x)
    return {
      h: H,
      body: [
        scatterGrid({ xt, yt, px, py, ml, mr, mt, mb, W, H }),
        s(
          'g',
          { class: 'axis', 'aria-hidden': 'true' },
          yt.map((t) => s('text', { x: ml - 6, y: py(t) + 3.5, 'text-anchor': 'end' }, t)),
          xt.map((t) => s('text', { x: px(t), y: H - 12, 'text-anchor': 'middle' }, t)),
          s('text', { x: W - mr, y: H - 1, 'text-anchor': 'end' }, `${c.xName} →`),
        ),
        c.data.map(
          (g, gi) =>
            !x.hidden.has(gi) &&
            s(
              'g',
              { 'data-series': gi, class: 'dots', style: `--_dc:${color(gi)};--i:${gi}` },
              list.map((p, i) => {
                if (p.gi !== gi) return null
                const X = px(p.x),
                  Y = py(p.y),
                  lab = `${p.name} (${g.name}): ${c.xName} ${f(p.x)}, ${c.yName} ${f(p.y)}`,
                  shape = gi % 3
                if (shape === 1)
                  return mark('rect', i, 0, lab, {
                    class: 's-pt',
                    style: 'r:auto',
                    x: X - 4,
                    y: Y - 4,
                    width: 8,
                    height: 8,
                    rx: 1,
                  })
                if (shape === 2)
                  return mark('path', i, 0, lab, {
                    class: 's-pt',
                    style: 'r:auto',
                    d: `M${f1(X)},${f1(Y - 5.5)}L${f1(X + 5.5)},${f1(Y)}L${f1(X)},${f1(Y + 5.5)}L${f1(X - 5.5)},${f1(Y)}Z`,
                  })
                return mark('circle', i, 0, lab, {
                  class: 's-pt',
                  style: 'r:4.5px',
                  cx: f1(X),
                  cy: f1(Y),
                  r: 4.5,
                })
              }),
            ),
        ),
      ],
    }
  },
}

/** Scatter plots where a point's size carries a value. */
export const bubble: Form<ScatterConfig> = {
  kind: 'bubble chart',
  legend: scatterLegend,
  table: scatterTable,
  summary: scatterSay,
  plot(c, W, x) {
    const H = W < 420 ? 190 : 220,
      ml = 30,
      mb = 22,
      { yt, px, py } = scales(c, W, H, ml, 8, 8, mb, 4),
      most = Math.max(1e-9, ...c.data.flatMap((g) => g.points.map((p) => p.size ?? 0))),
      rs = (v: number) => 3 + Math.sqrt(v / most) * (W < 420 ? 11 : 15),
      f = c.format ?? num
    return {
      h: H,
      body: [
        axisY(yt, py, ml, W - 8),
        c.data.map(
          (g, gi) =>
            !x.hidden.has(gi) &&
            s(
              'g',
              { 'data-series': gi, style: `--_dc:${color(gi)}` },
              [...g.points]
                .sort((a, b) => (b.size ?? 0) - (a.size ?? 0))
                .map((p) =>
                  mark(
                    'circle',
                    dots(c, x).findIndex((q) => q.name === p.name && q.gi === gi),
                    0,
                    `${p.name}: ${c.xName} ${f(p.x)}, ${c.yName} ${f(p.y)}, ${c.sizeName ?? 'size'} ${f(p.size ?? 0)}`,
                    {
                      class: 's-pt',
                      style: `r:${f1(rs(p.size ?? 0))}px;fill-opacity:.55`,
                      cx: f1(px(p.x)),
                      cy: f1(py(p.y)),
                      r: f1(rs(p.size ?? 0)),
                    },
                  ),
                ),
            ),
        ),
        s(
          'g',
          { class: 'axis', 'aria-hidden': 'true' },
          s('text', { x: W - 8, y: H - 6, 'text-anchor': 'end' }, `${c.xName} →`),
        ),
      ],
    }
  },
}

function scatterGrid({
  xt,
  yt,
  px,
  py,
  ml,
  mr,
  mt,
  mb,
  W,
  H,
}: {
  xt: number[]
  yt: number[]
  px: (n: number) => number
  py: (n: number) => number
  ml: number
  mr: number
  mt: number
  mb: number
  W: number
  H: number
}) {
  return s(
    'g',
    { class: 'grid', 'aria-hidden': 'true' },
    yt.map((t) =>
      s('line', {
        x1: ml,
        x2: W - mr,
        y1: py(t),
        y2: py(t),
        class: t === 0 ? 'zero' : undefined,
      }),
    ),
    xt.map((t) =>
      s('line', {
        y1: mt,
        y2: H - mb,
        x1: px(t),
        x2: px(t),
        class: t === 0 ? 'zero' : undefined,
      }),
    ),
  )
}
