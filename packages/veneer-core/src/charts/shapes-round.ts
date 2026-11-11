// The forms without x and y axes (06 §12, specimen 05 and 10): round ones, part-to-whole ones and grids.
import { mark } from './marks'
import { arc, color, f1, num, pct, sum } from './math'
import { s, type Kid } from './scene'
import { tableOf, type Base, type Fmt, type Form, type TipRow } from './types'

export const TAU = Math.PI * 2
export const centred = (W: number, size: number, ...c: Kid[]) =>
  s('g', { transform: `translate(${(W - size) / 2},0)` }, ...c)

/** One slice of a donut or pie. */
export type Slice = { name: string; value: number; color?: string }
/** Config for a donut or pie. */
export type DonutConfig = Base<Slice[]> & {
  pie?: boolean
  unit?: string
  format?: Fmt | undefined
  name?: string
}
function focusDonut(m: Element | null, svg: Element, c: DonutConfig, total: number, f: Fmt) {
  const fig = svg.closest('figure')!,
    v = svg.querySelector('.center-v'),
    l = svg.querySelector('.center-l')
  fig.toggleAttribute('data-isolate', !!m)
  for (const n of svg.querySelectorAll('[data-mark]'))
    n.toggleAttribute('data-series-active', n === m)
  if (!v || !l) return
  const d = m && c.data[Number(m.getAttribute('data-xi'))]
  v.textContent = d ? pct(d.value / total) : f(total)
  l.textContent = d ? d.name : (c.unit ?? 'total')
}

/** Donut and pie charts. */
export const donut: Form<DonutConfig> = {
  kind: 'donut chart',
  byMark: true,
  legend: (c) => {
    const t = sum(c.data.map((d) => d.value))
    return c.data.map((d, i) => ({
      name: d.name,
      color: d.color ?? color(i),
      value: pct(d.value / t),
    }))
  },
  table: (c) => {
    const t = sum(c.data.map((d) => d.value)),
      f = c.format ?? num
    return tableOf(
      [c.name ?? 'Name', c.unit ?? 'Value', 'Share'],
      c.data.map((d) => [d.name, f(d.value), pct(d.value / t)]),
    )
  },
  summary: (c) => {
    const t = sum(c.data.map((d) => d.value)),
      top = c.data.reduce((a, b) => (b.value > a.value ? b : a))
    return `${top.name} is the largest share at ${pct(top.value / t)} of ${(c.format ?? num)(t)}.`
  },
  plot(c, W, x) {
    const size = Math.min(W, 232),
      R = size / 2 - 10,
      sw = Math.max(14, R * 0.2),
      mid = size / 2,
      list = c.data.map((d, i) => ({ ...d, i })).filter((d) => !x.hidden.has(d.i)),
      total = sum(list.map((d) => d.value)),
      f = c.format ?? num,
      gap = 2 / R,
      pie = c.pie
    const r = pie ? R / 2 + sw / 2 : R,
      width = pie ? R + sw : sw,
      unit = c.unit ?? 'total'
    let a = -Math.PI / 2
    const fine = (d: { name: string; value: number }) =>
      `${d.name}: ${f(d.value)}${c.unit ? ` ${c.unit}` : ''}, ${pct(d.value / total)}`
    return {
      h: size,
      w: size,
      style: `inline-size:${size}px;max-inline-size:100%;margin-inline:auto`,
      body: [
        s('circle', {
          cx: mid,
          cy: mid,
          r,
          fill: 'none',
          stroke: 'var(--veneer-color-surface-sunken)',
          'stroke-width': width,
          'aria-hidden': 'true',
        }),
        list.map((d, k) => {
          const span = (d.value / total) * TAU,
            a0 = a + gap / 2,
            a1 = a + span - gap / 2
          a += span
          return mark('path', d.i, 0, fine(d), {
            'data-series': d.i,
            class: 'arc',
            style: `--_dc:${d.color ?? color(d.i)};--i:${k};--_aw-hot:${f1(width + 6)}px`,
            'stroke-width': f1(width),
            pathLength: 1,
            'stroke-dasharray': 1,
            d: arc(mid, mid, r, a0, a1),
          })
        }),
        !pie && [
          s(
            'text',
            {
              class: 'center-v',
              x: mid,
              y: mid + 6,
              'text-anchor': 'middle',
              'aria-hidden': 'true',
            },
            f(total),
          ),
          s(
            'text',
            {
              class: 'center-l',
              x: mid,
              y: mid + 24,
              'text-anchor': 'middle',
              'aria-hidden': 'true',
            },
            unit,
          ),
        ],
      ],
      tip: (i) => {
        const d = c.data[i]!
        return { rows: [[d.color ?? color(i), d.name, f(d.value)]] }
      },
      on: (m, svg) => focusDonut(m, svg, c, total, f),
    }
  },
}

/** Config for a radial bar chart: one ring per value, a share of the full circle. */
export type RadialConfig = Base<{ name: string; value: number }[]>
const A0 = -Math.PI / 2,
  SPAN = Math.PI * 1.5
/** Radial bar charts. */
export const radial: Form<RadialConfig> = {
  kind: 'radial bar chart',
  table: (c) =>
    tableOf(
      ['Name', 'Progress'],
      c.data.map((d) => [d.name, pct(d.value)]),
    ),
  summary: (c) => {
    const a = [...c.data].sort((p, q) => q.value - p.value),
      z = a[a.length - 1]!
    return `${a[0]!.name} is closest to target at ${pct(a[0]!.value)}; ${z.name} is furthest at ${pct(z.value)}.`
  },
  plot(c, W) {
    const size = Math.min(W, 230),
      mid = size / 2,
      sw = 12
    return {
      h: size,
      body: [
        centred(
          W,
          size,
          c.data.map((d, i) => {
            const R = mid - 10 - i * (sw + 5)
            return [
              s('path', {
                d: arc(mid, mid, R, A0, A0 + SPAN),
                fill: 'none',
                stroke: 'var(--veneer-color-surface-sunken)',
                'stroke-width': sw,
                'stroke-linecap': 'round',
              }),
              mark('path', i, 0, `${d.name}: ${pct(d.value)}`, {
                class: 'arc',
                style: `--_dc:${color(i)};--i:${i};--_aw-hot:${sw + 4}px;stroke-linecap:round`,
                'stroke-width': sw,
                pathLength: 1,
                'stroke-dasharray': 1,
                d: arc(mid, mid, R, A0, A0 + SPAN * d.value),
              }),
              s(
                'text',
                { class: 'lab-sub', x: mid - 8, y: mid - R + 4, 'text-anchor': 'end' },
                s('tspan', {}, `${d.name} `),
                s('tspan', { style: 'font-weight:600;fill:var(--veneer-color-text)' }, pct(d.value)),
              ),
            ]
          }),
        ),
      ],
    }
  },
}

/** Config for a radar chart: the axes, and each series' value on them. */
export type RadarConfig = Base<{ name: string; values: number[] }[]> & {
  axes: string[]
  format?: Fmt | undefined
}
/** Radar charts. */
export const radar: Form<RadarConfig> = {
  kind: 'radar chart',
  swatch: 'line',
  legend: (c) => c.data.map((v, i) => ({ name: v.name, color: color(i) })),
  table: (c) =>
    tableOf(
      ['Axis', ...c.data.map((v) => v.name)],
      c.axes.map((a, i) => [a, ...c.data.map((v) => (c.format ?? num)(v.values[i]!))]),
    ),
  summary: (c) => `${c.data.map((v) => v.name).join(' and ')} scored on ${c.axes.length} axes.`,
  plot(c, W, x) {
    const size = Math.min(W, 250),
      mid = size / 2,
      R = mid - 26,
      n = c.axes.length,
      f = c.format ?? num,
      P = (i: number, r: number): [number, number] => [
        mid + r * Math.sin((i / n) * TAU),
        mid - r * Math.cos((i / n) * TAU),
      ]
    const web = (k: number) =>
      c.axes
        .map((_, i) =>
          P(i, R * k)
            .map(f1)
            .join(','),
        )
        .join(' ')
    return {
      h: size,
      body: [
        centred(
          W,
          size,
          s(
            'g',
            { class: 'grid', 'aria-hidden': 'true' },
            [0.25, 0.5, 0.75, 1].map((k) =>
              s('polygon', { points: web(k), fill: 'none', stroke: 'var(--veneer-color-data-grid)' }),
            ),
            c.axes.map((_, i) => s('line', { x1: mid, y1: mid, x2: P(i, R)[0], y2: P(i, R)[1] })),
          ),
          s(
            'g',
            { class: 'axis', 'aria-hidden': 'true' },
            c.axes.map((a, i) => {
              const [X, Y] = P(i, R + 14)
              return s('text', { x: X, y: Y + 4, 'text-anchor': 'middle' }, a)
            }),
          ),
          c.data.map(
            (v, si) =>
              !x.hidden.has(si) &&
              s(
                'g',
                { 'data-series': si, style: `--_dc:${color(si)}` },
                s('polygon', {
                  class: 's-poly',
                  points: v.values
                    .map((val, i) =>
                      P(i, R * val)
                        .map(f1)
                        .join(','),
                    )
                    .join(' '),
                }),
                v.values.map((val, i) => {
                  const [X, Y] = P(i, R * val)
                  return mark('circle', i, si, `${v.name}, ${c.axes[i]}: ${f(val)}`, {
                    class: 's-pt',
                    cx: f1(X),
                    cy: f1(Y),
                    r: 3.5,
                  })
                }),
              ),
          ),
        ),
      ],
      tip: (i) => ({
        title: c.axes[i]!,
        rows: c.data.map((v, si): TipRow => [color(si), v.name, f(v.values[i]!)]),
      }),
    }
  },
}
