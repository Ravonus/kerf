import { axisY, mark, xLabels } from './marks'
import { color, lin, niceTicks, num, quantile } from './math'
import { s } from './scene'
import { tableOf, type Base, type Fmt, type Form, type TipRow } from './types'

/** One period's open, high, low and close. */
export type Ohlc = { label: string; open: number; high: number; low: number; close: number }
/** Config for a candlestick or OHLC chart. */
export type CandleConfig = Base<Ohlc[]> & { variant?: 'candle' | 'ohlc'; format?: Fmt | undefined }
const pf = (v: number) => v.toFixed(2)
/** Candlestick and OHLC charts. */
export const candlestick: Form<CandleConfig> = {
  kind: 'candlestick chart',
  table: (c) =>
    tableOf(
      ['Day', 'Open', 'High', 'Low', 'Close'],
      c.data.map((d) => [d.label, ...[d.open, d.high, d.low, d.close].map(c.format ?? pf)]),
    ),
  summary: (c) => {
    const f = c.format ?? pf,
      a = c.data
    return `${a.length} sessions; closed at ${f(a[a.length - 1]!.close)} from an open of ${f(a[0]!.open)}; ${a.filter((d) => d.close > d.open).length} up days.`
  },
  plot(c, W) {
    const H = W < 420 ? 190 : 220,
      ml = 40,
      mb = 22,
      f = c.format ?? pf,
      C = c.data,
      t = niceTicks(Math.min(...C.map((d) => d.low)), Math.max(...C.map((d) => d.high)), 4)
    const y = lin(t[0]!, t[t.length - 1]!, H - mb, 8),
      band = (W - ml - 4) / C.length,
      bw = Math.max(2, Math.min(10, band * 0.6))
    const tone = (d: Ohlc) =>
      d.close >= d.open ? 'var(--warp-color-data-up)' : 'var(--warp-color-data-down)'
    return {
      h: H,
      body: [
        axisY(t, y, ml, W - 4, (v) => v.toFixed(0)),
        candleMarks({ C, ml, band, bw, tone, f, c, y }),
        s(
          'g',
          { class: 'axis', 'aria-hidden': 'true' },
          xLabels(
            C.map((d) => d.label),
            (i) => ml + band * (i + 0.5),
            H - 6,
            64,
            W - ml,
          ),
        ),
      ],
      tip: (i) => {
        const d = C[i]!,
          col = tone(d)
        return {
          title: `${d.label} ${d.close >= d.open ? '▲' : '▼'}`,
          rows: (
            [
              ['Open', d.open],
              ['High', d.high],
              ['Low', d.low],
              ['Close', d.close],
            ] as const
          ).map(([l, v]): TipRow => [col, l, f(v)]),
        }
      },
    }
  },
}

/** Config for a box plot: named groups of raw values. */
export type BoxConfig = Base<{ name: string; values: number[] }[]> & { format?: Fmt | undefined }
const boxOf = (c: BoxConfig) =>
  c.data.map((g) => {
    const v = [...g.values].sort((a, b) => a - b),
      q1 = quantile(v, 0.25),
      md = quantile(v, 0.5),
      q3 = quantile(v, 0.75),
      iqr = q3 - q1
    const lo = Math.max(v[0]!, q1 - 1.5 * iqr),
      hi = Math.min(v[v.length - 1]!, q3 + 1.5 * iqr)
    return { n: g.name, q1, md, q3, lo, hi, out: v.filter((x) => x > hi || x < lo) }
  })
/** Box plots, with outliers past 1.5 IQR. */
export const box: Form<BoxConfig> = {
  kind: 'box plot',
  table: (c) => {
    const f = c.format ?? num
    return tableOf(
      ['Group', 'Q1', 'Median', 'Q3', 'Outliers'],
      boxOf(c).map((g) => [g.n, f(g.q1), f(g.md), f(g.q3), g.out.length]),
    )
  },
  summary: (c) => {
    const G = boxOf(c),
      m = G.map((g) => g.md),
      f = c.format ?? num
    return `Medians range from ${f(Math.min(...m))} to ${f(Math.max(...m))} across ${G.length} groups.`
  },
  plot(c, W) {
    const H = W < 420 ? 190 : 220,
      ml = 34,
      mb = 22,
      G = boxOf(c),
      f = c.format ?? num,
      t = niceTicks(0, Math.max(...G.flatMap((g) => [g.hi, ...g.out])), 3),
      y = lin(0, t[t.length - 1]!, H - mb, 8),
      band = (W - ml) / G.length,
      bw = Math.min(34, band * 0.45)
    return {
      h: H,
      body: [
        axisY(t, y, ml, W - 4),
        G.map((g, i) => {
          const cx = ml + band * (i + 0.5),
            wick = (x1: number, x2: number, y1: number, y2: number) =>
              s('line', { class: 's-wick', x1, x2, y1, y2 })
          return [
            s(
              'g',
              { style: `--_dc:${color(i)}` },
              wick(cx, cx, y(g.hi), y(g.q3)),
              wick(cx, cx, y(g.q1), y(g.lo)),
              wick(cx - bw / 4, cx + bw / 4, y(g.hi), y(g.hi)),
              wick(cx - bw / 4, cx + bw / 4, y(g.lo), y(g.lo)),
              mark(
                'rect',
                i,
                0,
                `${g.n}: median ${f(g.md)}, IQR ${f(g.q1)}–${f(g.q3)}, ${g.out.length} outliers`,
                {
                  x: cx - bw / 2,
                  y: y(g.q3),
                  width: bw,
                  height: y(g.q1) - y(g.q3),
                  rx: 3,
                  fill: 'color-mix(in oklab, var(--_dc) 22%, transparent)',
                  stroke: 'var(--_dc)',
                  'stroke-width': 1.5,
                },
              ),
              s('line', {
                x1: cx - bw / 2,
                x2: cx + bw / 2,
                y1: y(g.md),
                y2: y(g.md),
                stroke: 'var(--_dc)',
                'stroke-width': 2.5,
              }),
              g.out.map((o, k) =>
                s('circle', {
                  cx: cx + ((k * 37) % 9) - 4,
                  cy: y(o),
                  r: 2.5,
                  fill: 'none',
                  stroke: 'var(--_dc)',
                }),
              ),
            ),
            s('text', { class: 'lab-sub', x: cx, y: H - 6, 'text-anchor': 'middle' }, g.n),
          ]
        }),
      ],
    }
  },
}

function candleMarks({
  C,
  ml,
  band,
  bw,
  tone,
  f,
  c,
  y,
}: {
  C: Ohlc[]
  ml: number
  band: number
  bw: number
  tone: (d: Ohlc) => string
  f: (v: number) => string
  c: CandleConfig
  y: (v: number) => number
}) {
  return C.map((d, i) => {
    const up = d.close >= d.open,
      cx = ml + band * (i + 0.5),
      col = tone(d),
      label = `${d.label}: open ${f(d.open)}, high ${f(d.high)}, low ${f(d.low)}, close ${f(d.close)}, ${up ? 'up' : 'down'}`
    return s(
      'g',
      { style: `--_dc:${col}` },
      s('line', { class: 's-wick', x1: cx, x2: cx, y1: y(d.high), y2: y(d.low) }),
      c.variant === 'ohlc'
        ? [
            s('line', {
              class: 's-wick',
              x1: cx - bw / 2,
              x2: cx,
              y1: y(d.open),
              y2: y(d.open),
            }),
            s('line', {
              class: 's-wick',
              x1: cx,
              x2: cx + bw / 2,
              y1: y(d.close),
              y2: y(d.close),
            }),
            mark('rect', i, 0, label, {
              x: cx - bw / 2,
              y: y(d.high),
              width: bw,
              height: Math.max(1, y(d.low) - y(d.high)),
              fill: 'transparent',
            }),
          ]
        : mark('rect', i, 0, label, {
            x: cx - bw / 2,
            y: y(Math.max(d.open, d.close)),
            width: bw,
            height: Math.max(1, Math.abs(y(d.open) - y(d.close))),
            fill: up ? 'var(--warp-color-surface-raised)' : col,
            stroke: col,
            'stroke-width': 1.25,
          }),
    )
  })
}
