import { axisY, mark, refLine } from './marks'
import { barPath, color, f1, lin, monotone, niceTicks, num, sum } from './math'
import { s } from './scene'
import { tableOf, type Base, type Fmt, type Form } from './types'
import { type Reference } from './cartesian-common'

/** One step in a waterfall chart. */
export type WaterStep = { name: string; value: number; total?: boolean }
/** Config for a waterfall chart. */
export type WaterConfig = Base<WaterStep[]> & { format?: Fmt | undefined }
const signed = (v: number, f: Fmt) => (v > 0 ? `+${f(v)}` : `−${f(-v)}`)
/** Waterfall charts. */
export const waterfall: Form<WaterConfig> = {
  kind: 'waterfall chart',
  table: (c) => {
    const f = c.format ?? num
    return tableOf(
      ['Step', 'Value'],
      c.data.map((d) => [d.name, d.total ? f(d.value) : signed(d.value, f)]),
    )
  },
  summary: (c) => {
    const f = c.format ?? num,
      up = sum(c.data.filter((d) => !d.total && d.value > 0).map((d) => d.value)),
      dn = sum(c.data.filter((d) => !d.total && d.value < 0).map((d) => -d.value))
    return `From ${f(c.data[0]!.value)} to ${f(c.data[c.data.length - 1]!.value)}: +${f(up)} up, −${f(dn)} down.`
  },
  plot(c, W) {
    const H = W < 420 ? 190 : 220,
      ml = 38,
      mb = 34,
      S = c.data,
      f = c.format ?? num
    let top = 0,
      run = 0
    for (const d of S) {
      run = d.total ? d.value : run + d.value
      top = Math.max(top, run)
    }
    const t = niceTicks(0, top, 3),
      y = lin(0, t[t.length - 1]!, H - mb, 8),
      band = (W - ml) / S.length,
      bw = Math.min(40, band * 0.6)
    run = 0
    return {
      h: H,
      body: [
        axisY(t, y, ml, W - 4),
        S.map((d, i) => {
          const a = d.total ? 0 : run,
            b = d.total ? d.value : run + d.value,
            v = d.value
          run = b
          const x = ml + band * i + (band - bw) / 2,
            hi = y(Math.max(a, b)),
            h = Math.abs(y(a) - y(b)),
            col = d.total
              ? 'var(--veneer-color-neutral-solid)'
              : v > 0
                ? 'var(--veneer-color-data-up)'
                : 'var(--veneer-color-data-down)',
            word = d.name.split(' ')[0]!
          return [
            mark(
              'path',
              i,
              0,
              `${d.name}: ${d.total ? f(v) : `${v > 0 ? 'up' : 'down'} ${f(Math.abs(v))}`}`,
              {
                style: `fill:${col}`,
                d: barPath({ x, y: hi, w: bw, h: Math.max(1, h) }, v < 0 && !d.total ? 0 : 3),
              },
            ),
            i < S.length - 1 &&
              s('line', {
                x1: x + bw,
                x2: x + band,
                y1: y(run),
                y2: y(run),
                stroke: 'var(--veneer-color-border-strong)',
                'stroke-dasharray': '2 2',
              }),
            s(
              'text',
              { class: 'lab', x: x + bw / 2, y: hi - 5, 'text-anchor': 'middle' },
              d.total ? f(v) : `${v > 0 ? '▲ ' : '▼ '}${f(Math.abs(v))}`,
            ),
            s(
              'text',
              { class: 'lab-sub', x: x + bw / 2, y: H - 18, 'text-anchor': 'middle' },
              band < 64 && word.length > 5 ? `${d.name.slice(0, 4)}.` : word,
            ),
          ]
        }),
      ],
    }
  },
}

/** Config for a live stream of values. */
export type StreamConfig = Base<number[]> & {
  domain: [number, number]
  ticks?: number[]
  reference?: Reference
  unit?: string
  paused?: boolean
  format?: Fmt | undefined
  span?: string
}
/** Live streams, which swap values instead of tweening. */
export const stream: Form<StreamConfig> = {
  kind: 'streaming line chart',
  live: true,
  table: (c) =>
    tableOf(
      [`Points ago`, c.unit ?? 'Value'],
      c.paused
        ? c.data.map((v, i): [number, number] => [c.data.length - 1 - i, Math.round(v)]).reverse()
        : [],
    ),
  summary: (c) => {
    const u = c.unit ? ` ${c.unit}` : '',
      last = c.data[c.data.length - 1]!
    return c.paused
      ? `Paused. Latest ${Math.round(last)}${u}; window range ${Math.round(Math.min(...c.data))}–${Math.round(Math.max(...c.data))}.`
      : `Live: ${c.title} over the last ${c.data.length} points, between ${c.domain[0]} and ${c.domain[1]}. Pause to read the latest value.`
  },
  plot(c, W) {
    const H = 200,
      ml = 34,
      mr = 54,
      mt = 10,
      mb = 22,
      n = c.data.length,
      px = lin(0, n - 1, ml, W - mr),
      py = lin(c.domain[0], c.domain[1], H - mb, mt),
      [d0, d1] = c.domain
    const ticks = c.ticks ?? niceTicks(d0, d1, 3).filter((t) => t >= d0 && t <= d1),
      pts = c.data.map((v, i) => [px(i), py(v)]),
      last = pts[n - 1]!,
      val = Math.round(c.data[n - 1]!),
      ref = c.reference
    return {
      h: H,
      body: [
        axisY(ticks, py, ml, W - mr),
        ref && refLine([ml, W - mr], py(ref.y), ref.label, W - mr - 4, 'end'),
        s(
          'g',
          { style: `--_dc:${color(0)}` },
          s('path', { class: 's-line', d: monotone(pts) }),
          s('circle', { class: 's-pt', cx: f1(last[0]!), cy: f1(last[1]!), r: 4, style: 'r:4px' }),
          s('text', { class: 's-end', x: last[0]! + 8, y: f1(last[1]! + 4) }, val),
        ),
        s(
          'g',
          { class: 'axis', 'aria-hidden': 'true' },
          s('text', { x: ml, y: H - 6 }, c.span ?? 'oldest'),
          s('text', { x: W - mr, y: H - 6, 'text-anchor': 'end' }, 'now'),
        ),
        mark('rect', 0, 0, `Latest ${val}${c.unit ? ` ${c.unit}` : ''}`, {
          x: f1(last[0]! - 6),
          y: f1(last[1]! - 6),
          width: 12,
          height: 12,
          fill: 'transparent',
        }),
      ],
    }
  },
}
