// The forms without x and y axes (06 §12, specimen 05 and 10): round ones, part-to-whole ones and grids.
import { mark } from './marks'
import { arc, color, f1, lin, num, pct, polar, ring, sum } from './math'
import { s } from './scene'
import { tableOf, type Base, type Fmt, type Form } from './types'

import { centred, TAU } from './shapes-round'

/** Config for a sunburst: groups and their children. */
export type SunConfig = Base<{ name: string; children: { name: string; value: number }[] }[]> & {
  format?: Fmt | undefined
  total?: string
}
/** Sunburst charts. */
export const sunburst: Form<SunConfig> = {
  kind: 'sunburst chart',
  table: (c) => {
    const t = sum(c.data.flatMap((g) => g.children.map((k) => k.value)))
    return tableOf(
      ['Category', 'Item', 'Share'],
      c.data.flatMap((g) => g.children.map((k) => [g.name, k.name, pct(k.value / t)])),
    )
  },
  summary: (c) => {
    const all = c.data.map((g) => ({ n: g.name, v: sum(g.children.map((k) => k.value)) })),
      t = sum(all.map((g) => g.v)),
      top = all.reduce((a, b) => (b.v > a.v ? b : a))
    return `${top.n} is ${pct(top.v / t)} of the total.`
  },
  plot(c, W) {
    const size = Math.min(W, 240),
      m = size / 2,
      t = sum(c.data.flatMap((g) => g.children.map((k) => k.value)))
    let a = -Math.PI / 2,
      k = 0
    const out = c.data.flatMap((g, ci) => {
      const total = sum(g.children.map((n) => n.value)),
        a0 = a,
        base = color(ci)
      return [
        mark('path', k++, 0, `${g.name}: ${pct(total / t)}`, {
          class: 's-rect',
          style: `--_dc:${base}`,
          d: ring(m, m * 0.32, m * 0.62, a0, a0 + (total / t) * TAU),
        }),
        ...g.children.map((n, j) => {
          const a1 = a + (n.value / t) * TAU,
            d = ring(m, m * 0.64, m * 0.96, a, a1)
          a = a1
          return mark('path', k++, 0, `${g.name} › ${n.name}: ${pct(n.value / t)}`, {
            class: 's-rect',
            style: `--_dc:color-mix(in oklab, ${base} ${80 - j * 22}%, var(--veneer-color-surface-raised))`,
            d,
          })
        }),
      ]
    })
    return {
      h: size,
      body: [
        centred(
          W,
          size,
          out,
          s(
            'text',
            { class: 'center-l', x: m, y: m + 4, 'text-anchor': 'middle' },
            c.total ?? (c.format ?? num)(t),
          ),
        ),
      ],
    }
  },
}

/** A coloured stretch of a gauge's scale. */
export type Band = [from: number, to: number, color: string]
/** Config for a gauge: one value, with optional bands. */
export type GaugeConfig = Base<number> & {
  bands?: Band[]
  format?: Fmt | undefined
  label?: string
}
const BANDS: Band[] = [
  [0, 0.5, 'var(--veneer-color-positive-solid)'],
  [0.5, 0.8, 'var(--veneer-color-caution-solid)'],
  [0.8, 1, 'var(--veneer-color-critical-solid)'],
]
/** Gauges. */
export const gauge: Form<GaugeConfig> = {
  kind: 'gauge',
  table: (c) =>
    tableOf(
      ['Band', 'Range'],
      [
        ...(c.bands ?? BANDS).map(([a, b], i): [string, string] => [
          `Band ${i + 1}`,
          `${pct(a)}–${pct(b)}`,
        ]),
        ['Current', pct(c.data)],
      ],
    ),
  summary: (c) => `${c.label ?? c.title}: ${pct(c.data)}.`,
  plot(c, W) {
    const size = Math.min(W, 260),
      cx = size / 2,
      cy = size * 0.56,
      R = size * 0.4,
      sw = 14,
      v = c.data,
      bands = c.bands ?? BANDS,
      at = (t: number) => Math.PI * (1 + t),
      hit = bands.find(([a, b]) => v >= a && v <= b)?.[2] ?? bands[0]![2],
      [nx, ny] = polar(cx, cy, R - 22, at(v))
    return {
      h: f1Num(cy + 44),
      body: [
        centred(
          W,
          size,
          bands.map(([a, b, col]) =>
            s('path', {
              d: arc(cx, cy, R, at(a + 0.004), at(b - 0.004)),
              fill: 'none',
              stroke: col,
              'stroke-opacity': 0.28,
              'stroke-width': sw,
            }),
          ),
          s('path', {
            d: arc(cx, cy, R, at(0), at(v)),
            fill: 'none',
            stroke: hit,
            'stroke-width': sw,
            pathLength: 1,
            'stroke-dasharray': 1,
            class: 'arc',
            style: `--_dc:${hit};stroke-linecap:butt`,
          }),
          s('line', {
            x1: cx,
            y1: cy,
            x2: nx,
            y2: ny,
            stroke: 'var(--veneer-color-text)',
            'stroke-width': 2,
            'stroke-linecap': 'round',
          }),
          s('circle', { cx, cy, r: 5, fill: 'var(--veneer-color-text)' }),
          s('text', { class: 'center-v', x: cx, y: cy + 34, 'text-anchor': 'middle' }, pct(v)),
          mark('rect', 0, 0, `${c.label ?? c.title} ${pct(v)}`, {
            x: cx - R,
            y: cy - R - 10,
            width: 2 * R,
            height: R + 10,
            fill: 'transparent',
          }),
        ),
      ],
    }
  },
}
const f1Num = (v: number) => +f1(v)

/** Config for a funnel: its stages, widest first. */
export type FunnelConfig = Base<{ name: string; value: number }[]> & {
  format?: Fmt | undefined
  unit?: string
}
const short = (v: number) => (v >= 1000 ? `${+(v / 1000).toFixed(1)}k` : String(v))
const ofPrev = (c: FunnelConfig, i: number) =>
  Math.round((c.data[i]!.value / c.data[i - 1]!.value) * 100)
/** Funnel charts. */
export const funnel: Form<FunnelConfig> = {
  kind: 'funnel chart',
  table: (c) =>
    tableOf(
      ['Step', c.unit ?? 'Value', 'Of previous'],
      c.data.map((d, i) => [d.name, (c.format ?? num)(d.value), i ? `${ofPrev(c, i)}%` : '–']),
    ),
  summary: (c) => {
    const a = c.data,
      z = a[a.length - 1]!
    return `Of ${(c.format ?? num)(a[0]!.value)} at ${a[0]!.name}, ${pct(z.value / a[0]!.value)} reach ${z.name}.`
  },
  plot(c, W) {
    const H = W < 420 ? 190 : 220,
      bh = (H - 10) / c.data.length - 6,
      x = lin(0, c.data[0]!.value, 0, W - 120),
      f = c.format ?? num
    return {
      h: H,
      body: c.data.map((d, i) => {
        const w = Math.max(4, x(d.value)),
          y = 4 + i * (bh + 6)
        return [
          mark(
            'rect',
            i,
            0,
            `${d.name}: ${f(d.value)}${i ? `, ${ofPrev(c, i)}% of previous` : ''}`,
            {
              class: 's-bar',
              style: `--_dc:${color(0)};--i:${i};fill-opacity:${+(1 - i * 0.12).toFixed(2)}`,
              x: 0,
              y,
              width: w,
              height: bh,
              rx: 3,
            },
          ),
          s('text', { class: 'lab', x: w + 8, y: y + bh / 2 - 2 }, d.name),
          s(
            'text',
            { class: 'lab-sub', x: w + 8, y: y + bh / 2 + 11 },
            `${short(d.value)}${i ? ` · ${ofPrev(c, i)}%` : ''}`,
          ),
        ]
      }),
    }
  },
}
