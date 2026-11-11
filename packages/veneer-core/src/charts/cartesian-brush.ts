import { anno, axisY, mark, refLine, xLabels } from './marks'
import { clamp, color, f1, lin, monotone, niceTicks, num } from './math'
import { s } from './scene'
import { tableOf, type Base, type Fmt, type Form } from './types'
import { labels, type Row, type Cells, type Reference } from './cartesian-common'

/** Config for a chart with a brush below it for picking a range. */
export type BrushConfig = Base<Row[]> & {
  x: string
  y: string
  name?: string
  domain: [number, number]
  target?: Reference
  ticks?: number[]
  format?: Fmt | undefined
  annotation?: string
  gap?: number | undefined
}
const MIN = 10
/** A line with a brush for picking the range it shows. */
export const brush: Form<BrushConfig> = {
  kind: 'line chart with brush',
  table: (c) => {
    const f = c.format ?? num,
      step = Math.max(1, Math.round(c.data.length / 18))
    return tableOf(
      [c.x, c.name ?? c.y],
      c.data
        .filter((_, i) => i % step === 0)
        .map((r) => [String((r as Cells)[c.x]), f(Number((r as Cells)[c.y]))]),
    )
  },
  summary: (c) => {
    const f = c.format ?? num,
      v = c.data.map((r) => Number((r as Cells)[c.y])),
      hit = c.target ? v.findIndex((t) => t > c.target!.y) : -1
    return `${v.length} points from ${f(v[0]!)} to ${f(v[v.length - 1]!)}.${hit >= 0 ? ` ${c.target!.label} was first crossed at ${(c.data[hit] as Record<string, string>)[c.x]}.` : ''}`
  },
  plot(c, W, x) {
    const v = c.data.map((r) => Number((r as Cells)[c.y])),
      N = v.length,
      X = labels(c),
      f = c.format ?? num,
      H = W < 420 ? 250 : 290
    const view = (x.view ??= { b0: Math.max(0, N - Math.ceil(N / 3)), b1: N - 1 }),
      b0 = Math.min(view.b0, N - 1),
      b1 = Math.min(view.b1, N - 1)
    const ml = 36,
      mr = 12,
      mt = 12,
      top = H - 70,
      ov = [H - 44, H - 6],
      [d0, d1] = c.domain
    const xs = lin(b0, b1, ml, W - mr),
      ys = lin(d0, d1, top, mt),
      xo = lin(0, N - 1, ml, W - mr),
      yo = lin(d0, d1, ov[1]!, ov[0]!)
    const seg = v.slice(b0, b1 + 1).map((n, k) => [xs(b0 + k), ys(n)]),
      t = c.target,
      hit = t ? v.findIndex((n) => n > t.y) : -1,
      name = c.name ?? c.y
    const ticks = c.ticks ?? niceTicks(d0, d1, 2).filter((n) => n >= d0 && n <= d1)
    return {
      h: H,
      body: [
        axisY(ticks, ys, ml, W - mr),
        t && refLine([ml, W - mr], ys(t.y), t.label, ml + 4),
        hit >= b0 &&
          hit <= b1 &&
          c.annotation &&
          anno(xs(hit), [mt, top], c.annotation, [xs(hit) + 5, mt + 10]),
        s(
          'g',
          { style: `--_dc:${color(0)}` },
          s('path', { class: 's-line', d: monotone(seg) }),
          seg.map((p, k) =>
            mark('circle', k, 0, `${X[b0 + k]}: ${f(v[b0 + k]!)} ${name}`, {
              class: 's-pt',
              cx: f1(p[0]!),
              cy: f1(p[1]!),
              r: 3.5,
            }),
          ),
        ),
        s(
          'g',
          { class: 'axis', 'aria-hidden': 'true' },
          xLabels(X.slice(b0, b1 + 1), (k) => xs(b0 + k), top + 14, [70, W - ml], true),
        ),
        s(
          'g',
          { 'aria-hidden': 'true', style: `--_dc:${color(0)}` },
          s('path', {
            d: monotone(v.map((n, i) => [xo(i), yo(n)])),
            fill: 'none',
            stroke: 'var(--veneer-color-text-subtle)',
            'stroke-width': 1,
          }),
        ),
        s('rect', {
          class: 'brush',
          'data-brush': true,
          x: f1(xo(b0)),
          y: ov[0]! - 2,
          width: f1(xo(b1) - xo(b0)),
          height: ov[1]! - ov[0]! + 4,
          rx: 3,
        }),
        brushHandles({ b0, b1, N, X, xo, ov }),
      ],
      pick: (px, py) =>
        py > top
          ? null
          : `[data-mark][data-xi="${clamp(Math.round((px - ml) / ((W - ml - mr) / (b1 - b0))), 0, b1 - b0)}"]`,
    }
  },
  behave({ svg, draw, ctx }) {
    const N = () => Number(svg.querySelector('[data-h]')!.getAttribute('aria-valuemax')) + 1
    const set = (h: string, d: number) => {
      const v = ctx.view!
      if (h === 'b0') v.b0 = clamp(v.b0 + d, 0, v.b1 - MIN)
      else v.b1 = clamp(v.b1 + d, v.b0 + MIN, N() - 1)
      draw()
    }
    const key = (e: Event) => {
      const k = e as KeyboardEvent,
        h = (k.target as Element).closest?.('[data-h]')
      const by = { ArrowRight: 1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[k.key]
      if (!h || !by) return
      k.preventDefault()
      k.stopPropagation()
      set(h.getAttribute('data-h')!, by)
    }
    const down = (e: Event) => {
      const p = e as PointerEvent,
        t = p.target as Element,
        h = t.closest?.('[data-h]')?.getAttribute('data-h'),
        onBrush = t.closest?.('[data-brush]')
      if (!h && !onBrush) return
      p.preventDefault()
      const r = svg.getBoundingClientRect(),
        W = Number(svg.getAttribute('width')),
        v = ctx.view!,
        x0 = p.clientX,
        a = v.b0,
        b = v.b1,
        step = (((W - 48) / (N() - 1)) * r.width) / W
      const move = (m: PointerEvent) => {
        const di = Math.round((m.clientX - x0) / step)
        if (h === 'b0') v.b0 = clamp(a + di, 0, v.b1 - MIN)
        else if (h === 'b1') v.b1 = clamp(b + di, v.b0 + MIN, N() - 1)
        else {
          v.b0 = clamp(a + di, 0, N() - 1 - (b - a))
          v.b1 = v.b0 + (b - a)
        }
        draw()
      }
      const up = () => {
        removeEventListener('pointermove', move)
        removeEventListener('pointerup', up)
      }
      addEventListener('pointermove', move)
      addEventListener('pointerup', up)
    }
    svg.addEventListener('keydown', key)
    svg.addEventListener('pointerdown', down)
    return () => {
      svg.removeEventListener('keydown', key)
      svg.removeEventListener('pointerdown', down)
    }
  },
}

function brushHandles({
  b0,
  b1,
  N,
  X,
  xo,
  ov,
}: {
  b0: number
  b1: number
  N: number
  X: string[]
  xo: (v: number) => number
  ov: number[]
}) {
  return (
    [
      ['b0', b0],
      ['b1', b1],
    ] as const
  ).map(([k, at]) =>
    s(
      'g',
      {
        class: 'brush-hg',
        'data-h': k,
        tabindex: 0,
        role: 'slider',
        'aria-label': k === 'b0' ? 'Window start' : 'Window end',
        'aria-valuemin': 0,
        'aria-valuemax': N - 1,
        'aria-valuenow': at,
        'aria-valuetext': X[at],
      },
      s('rect', {
        class: 'brush-hit',
        x: f1(xo(at) - 12),
        y: ov[0]! - 2,
        width: 24,
        height: ov[1]! - ov[0]! + 4,
      }),
      s('rect', {
        class: 'brush-h',
        x: f1(xo(at) - 4),
        y: ov[0]! + 6,
        width: 8,
        height: ov[1]! - ov[0]! - 12,
        rx: 2,
      }),
    ),
  )
}
