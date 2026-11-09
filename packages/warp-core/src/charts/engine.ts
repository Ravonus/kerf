// The one chart behaviour (06 §1.3, §4, §12): `chart(figure, { form, cfg })` adopts the markup a binding rendered (the
// server's or a client's) and from then on owns the plot. One tab stop; ←/→ walk x, ↑/↓ change series, Home/End jump;
// the tooltip follows hover, tap-and-drag and focus, Escape closes it. Width changes and data changes lay out again
// and patch attributes in place. The legend, the chart | table toggle and the enter motion are delegated from the
// figure, so a binding only has to render the markup.
import { esc, patch } from './scene'
import { chartMarks } from './engine-marks'
import { chartObservers } from './engine-observers'
import { chartDraw, type ChartState } from './engine-draw'
import { chartPointers, chartKeyboard, chartLegend, chartBind } from './engine-events'
import { f1 } from './math'
import { sparkPoints, sparkScene } from './spark'
import type { Ctx, Form, Plot, TableData } from './types'

/** The width a chart lays out at when nothing can be measured (the server's first pass). */
export const SSR_WIDTH = 640
/** `--warp-radius-mark` at the default stop: what the server lays out with. */
export const SSR_RADIUS = 3

/** The table view (06 §12): a real table, header row and row headers. */
export const tableHTML = ({ head, rows }: TableData) =>
  `<table><thead><tr>${head.map((h) => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.map((r) => `<tr>${r.map((c, i) => (i ? `<td>${esc(String(c))}</td>` : `<th scope="row">${esc(String(c))}</th>`)).join('')}</tr>`).join('')}</tbody></table>`

/** What `chart` draws: a form, its config, and an id for the marks. */
export type ChartOptions<C> = { form: Form<C>; cfg: C; id: string }

/** Takes over a chart's rendered figure and from then on owns its plot, tooltip, keyboard and legend. */
export function chart<C>(fig: HTMLElement, o: ChartOptions<C>) {
  const $ = (q: string) => fig.querySelector(q)!
  const svg = $('svg[data-part="svg"]') as SVGSVGElement,
    area = $('[data-part="plot"]') as HTMLElement,
    tip = $('[data-part="chart-tip"]') as HTMLElement
  const ctx: Ctx = { id: o.id, hidden: new Set<number>(), r: SSR_RADIUS }
  const hidden = ctx.hidden as Set<number>
  const state: ChartState<C> = {
    form: o.form,
    cfg: o.cfg,
    plot: undefined as unknown as Plot,
    width: Number(svg.getAttribute('width')) || SSR_WIDTH,
    stop: () => {},
  }
  let enterTimer: ReturnType<typeof setTimeout> | undefined

  const markState = chartMarks(fig, svg, area, tip, state)
  const { walk, hide } = markState
  const draw = chartDraw(fig, svg, ctx, state, walk)
  const events = chartPointers(fig, svg, markState, state)
  const key = chartKeyboard(markState)
  const legend = chartLegend(fig, svg, hidden, markState, {
    draw,
    get byMark() {
      return state.form.byMark
    },
  })

  const enter = (replay?: boolean) => {
    if (replay) {
      fig.removeAttribute('data-enter')
      void fig.getBoundingClientRect()
    }
    fig.dataset.enter = 'run'
    clearTimeout(enterTimer)
    enterTimer = setTimeout(() => fig.removeAttribute('data-enter'), 1900)
  }
  const observers = chartObservers(fig, area, ctx, { draw, enter }, state)

  state.plot = state.form.plot(state.cfg, state.width, ctx)
  walk()
  chartBind(fig, area, svg, { events, key, legend })
  observers.connect()
  const unbehave = state.form.behave?.({ svg, ctx, draw: () => draw() })

  return {
    update(n: ChartOptions<C>) {
      const swap =
        (n.cfg as { layout?: unknown }).layout !== (state.cfg as { layout?: unknown }).layout
      state.form = n.form
      state.cfg = n.cfg
      if (swap) enter(true)
      draw(!swap && !state.form.live)
      if (markState.active && !markState.active.isConnected) hide()
    },
    destroy() {
      const stop = state.stop
      stop()
      clearTimeout(enterTimer)
      unbehave?.()
      observers.disconnect()
      document.removeEventListener('pointerdown', events.outside)
      observers.release()
    },
  }
}

/** What a sparkline takes: its values, or its values and the formatter its headline uses (the hover says it the same way). */
export type SparkInput = number[] | { values: number[]; format?: (value: number) => string }
const sparkOf = (input: SparkInput) =>
  Array.isArray(input) ? { values: input, format: undefined } : input

/** A sparkline's width follows its box; everything else is the parent's label (06 §12: aria-hidden). */
export function spark(el: SVGSVGElement, input: SparkInput) {
  let list = sparkOf(input).values
  let format = sparkOf(input).format
  let home: [string | null, string | null] | undefined // where the dot rests, while a hover has it
  const draw = () => {
    const w = Math.round(el.clientWidth)
    if (!w) return
    el.setAttribute('viewBox', `0 0 ${w} 36`)
    patch(el, sparkScene(list, w))
    home = undefined
  }
  const size = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(draw)
  size?.observe(el)
  // hover walks the end dot along the line and says the value there; the parent's label stays the meaning
  const note = el.ownerDocument.createElementNS('http://www.w3.org/2000/svg', 'text')
  note.setAttribute('font-size', '11')
  note.setAttribute('fill', 'currentColor')
  const hover = (e: PointerEvent) => {
    const r = el.getBoundingClientRect(),
      dot = el.querySelector('.dot')
    if (!dot || !r.width || !list.length) return
    const pts = sparkPoints(list, r.width),
      x = e.clientX - r.left
    const i = pts.reduce(
      (best, p, n) => (Math.abs(p[0] - x) < Math.abs(pts[best]![0] - x) ? n : best),
      0,
    )
    const [px, py] = pts[i]!,
      value = list[i]!
    home ??= [dot.getAttribute('cx'), dot.getAttribute('cy')]
    dot.setAttribute('cx', f1(px))
    dot.setAttribute('cy', f1(py))
    const left = px < r.width / 2
    note.textContent = format ? format(value) : String(value)
    note.setAttribute('text-anchor', left ? 'start' : 'end')
    note.setAttribute('x', f1(px + (left ? 6 : -6)))
    note.setAttribute('y', f1(Math.max(10, py - 6)))
    el.append(note)
  }
  const rest = () => {
    note.remove()
    const dot = el.querySelector('.dot')
    if (dot && home) {
      dot.setAttribute('cx', home[0]!)
      dot.setAttribute('cy', home[1]!)
    }
    home = undefined
  }
  el.addEventListener('pointermove', hover)
  el.addEventListener('pointerleave', rest)
  return {
    update(v: SparkInput) {
      ;({ values: list, format } = sparkOf(v))
      draw()
    },
    destroy() {
      size?.disconnect()
      el.removeEventListener('pointermove', hover)
      el.removeEventListener('pointerleave', rest)
    },
  }
}
