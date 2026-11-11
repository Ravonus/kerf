import type { Plot } from './types'
import type { chartMarks } from './engine-marks'

type Marks = ReturnType<typeof chartMarks>

/** Create the pointer and focus handlers for a chart. */
export function chartPointers(
  fig: HTMLElement,
  svg: SVGSVGElement,
  marks: Marks,
  current: { readonly plot: Plot },
) {
  const { at, show, hide } = marks
  let touch = false
  const down = (e: PointerEvent) => {
    if (e.pointerType !== 'mouse') {
      touch = true
      const m = at(e)
      if (m) show(m)
    }
  }
  const move = (e: PointerEvent) => {
    if (e.pointerType === 'touch' && !touch) return
    const m = at(e)
    if (m) show(m)
    else if (!current.plot.pick) hide()
  }
  const up = () => {
    touch = false
  }
  const leave = (e: PointerEvent) => {
    if (e.pointerType === 'mouse' && !svg.contains(document.activeElement)) hide()
  }
  const outside = (e: Event) => {
    if (!fig.contains(e.target as Node)) hide()
  }
  const focusIn = (e: Event) => {
    const m = (e.target as Element).closest?.('[data-mark]')
    if (m) show(m, true)
  }
  const focusOut = (e: FocusEvent) => {
    if (!svg.contains(e.relatedTarget as Node)) hide()
  }
  return { down, move, up, leave, outside, focusIn, focusOut }
}

/** Create the keyboard handler for chart marks. */
export function chartKeyboard(markState: Marks) {
  const { xi, si, hide } = markState
  function key(e: KeyboardEvent) {
    const m = (e.target as Element).closest?.('[data-mark]')
    if (!m) return
    const x = xi(m),
      y = si(m),
      find = (fx: number, fs: number) => markState.marks.find((n) => xi(n) === fx && si(n) === fs)
    const xs = [...new Set(markState.marks.map(xi))],
      ys = [...new Set(markState.marks.map(si))],
      px = xs.indexOf(x),
      py = ys.indexOf(y),
      i = markState.marks.indexOf(m)
    let next: Element | undefined
    if (e.key === 'ArrowRight')
      next =
        find(xs[Math.min(xs.length - 1, px + 1)]!, y) ??
        markState.marks[Math.min(markState.marks.length - 1, i + 1)]
    else if (e.key === 'ArrowLeft')
      next = find(xs[Math.max(0, px - 1)]!, y) ?? markState.marks[Math.max(0, i - 1)]
    else if (e.key === 'ArrowUp') next = find(x, ys[Math.max(0, py - 1)]!)
    else if (e.key === 'ArrowDown') next = find(x, ys[Math.min(ys.length - 1, py + 1)]!)
    else if (e.key === 'Home') next = markState.marks[0]
    else if (e.key === 'End') next = markState.marks[markState.marks.length - 1]
    else if (e.key === 'Escape') return hide()
    else return
    e.preventDefault()
    ;(next as SVGElement | undefined)?.focus()
  }

  return key
}

/** Create the legend handlers for a chart. */
export function chartLegend(
  fig: HTMLElement,
  svg: SVGSVGElement,
  hidden: Set<number>,
  markState: Marks,
  current: { draw: () => void; readonly byMark: boolean | undefined },
) {
  const { show, hide } = markState
  const isolate = (index: number | null) => {
    fig.toggleAttribute('data-isolate', index !== null)
    for (const g of fig.querySelectorAll('[data-series]'))
      g.toggleAttribute('data-series-active', g.getAttribute('data-series') === String(index))
  }
  function click(e: Event) {
    const b = (e.target as Element).closest?.('button')
    if (!b) return
    if (b.closest('[data-part="view-toggle"]')) {
      fig.dataset.view = b.dataset.view
      for (const x of b.parentElement!.children) x.setAttribute('aria-pressed', String(x === b))
    } else if (b.closest('[data-scope="legend"]')) {
      const i = Number(b.dataset.si),
        on = b.getAttribute('aria-pressed') === 'true',
        all = fig.querySelectorAll('[data-scope="legend"] button').length
      if (on && hidden.size >= all - 1) return
      if (on) hidden.add(i)
      else hidden.delete(i)
      b.setAttribute('aria-pressed', String(!on))
      hide()
      current.draw()
    }
  }
  function over(e: Event) {
    const b = (e.target as Element).closest?.('[data-scope="legend"] button') as HTMLElement | null
    if (!b) return
    if (current.byMark) {
      const m = svg.querySelector(`[data-mark][data-xi="${b.dataset.si}"]`)
      if (m) show(m)
    } else isolate(Number(b.dataset.si))
  }
  function out(e: Event) {
    if (!(e.target as Element).closest?.('[data-scope="legend"] button')) return
    if (current.byMark) hide()
    else isolate(null)
  }

  return { click, over, out }
}

/** Attach the chart's listeners in their original order. */
export function chartBind(
  fig: HTMLElement,
  area: HTMLElement,
  svg: SVGSVGElement,
  on: {
    events: ReturnType<typeof chartPointers>
    key: ReturnType<typeof chartKeyboard>
    legend: ReturnType<typeof chartLegend>
  },
) {
  const { events, key, legend } = on
  const { click, over, out } = legend
  const { focusIn, focusOut, down, move, up, leave, outside } = events
  fig.addEventListener('click', click)
  fig.addEventListener('pointerover', over)
  fig.addEventListener('pointerout', out)
  // A focus listener on an SVG makes Chromium focus it on click.
  area.addEventListener('focusin', focusIn)
  area.addEventListener('focusout', focusOut)
  area.addEventListener('keydown', key)
  svg.addEventListener('pointermove', move)
  svg.addEventListener('pointerdown', down)
  svg.addEventListener('pointerup', up)
  svg.addEventListener('pointerleave', leave)
  document.addEventListener('pointerdown', outside)
}
