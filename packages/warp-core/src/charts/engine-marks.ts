import { esc } from './scene'
import type { Plot, Tip } from './types'

/** The current plot and width, read on each interaction. */
export type ChartCurrent = { readonly plot: Plot; readonly width: number }

// the dim of a row that isn't the hovered series: .6 in the specimen, 4.41:1 on the overlay, so .62
const tipHTML = ({ title, rows = [] }: Tip) =>
  (title === undefined ? '' : `<div data-part="tip-title">${esc(title)}</div>`) +
  rows
    .map(
      ([c, l, v, dim]) =>
        `<div data-part="tip-row" style="--_dc:${c}${dim ? ';opacity:.62' : ''}"><i></i>${esc(l)}<b>${esc(v)}</b></div>`,
    )
    .join('')

/** Track the active mark and its tooltip. */
export function chartMarks(
  fig: HTMLElement,
  svg: SVGSVGElement,
  area: HTMLElement,
  tip: HTMLElement,
  current: ChartCurrent,
) {
  let marks: Element[] = []
  let active: Element | null = null
  const walk = () => {
    marks = [...svg.querySelectorAll('[data-mark]')].sort((a, b) => xi(a) - xi(b) || si(a) - si(b))
    const on = marks.includes(active as Element)
      ? active
      : (marks.find((m) => m.getAttribute('tabindex') === '0') ?? marks[0])
    for (const m of marks)
      if (m.getAttribute('tabindex') !== (m === on ? '0' : '-1'))
        m.setAttribute('tabindex', m === on ? '0' : '-1')
  }
  const xi = (m: Element) => Number(m.getAttribute('data-xi'))
  const si = (m: Element) => Number(m.getAttribute('data-si') ?? 0)

  function show(m: Element, viaKey?: boolean) {
    if (active && active !== m) active.removeAttribute('data-active')
    active = m
    m.setAttribute('data-active', '')
    // oxlint-disable-next-line weft/no-html-sink -- tipHTML escapes every value it writes
    tip.innerHTML = tipHTML(
      current.plot.tip?.(xi(m), si(m), m) ?? { title: m.getAttribute('aria-label') ?? '' },
    )
    tip.setAttribute('data-open', '')
    fig.setAttribute('data-hot', '')
    current.plot.on?.(m, svg)
    const b = (m as SVGGraphicsElement).getBBox?.() ?? { x: 0, y: 0, width: 0, height: 0 }
    place(svg, area, tip, current, b.x + b.width / 2, b.y)
    if (viaKey) for (const x of marks) x.setAttribute('tabindex', x === m ? '0' : '-1')
  }
  function hide() {
    active?.removeAttribute('data-active')
    active = null
    tip.removeAttribute('data-open')
    fig.removeAttribute('data-hot')
    current.plot.on?.(null, svg)
  }
  const at = (e: PointerEvent) => {
    if (!current.plot.pick) return (e.target as Element).closest?.('[data-mark]') ?? null
    const r = svg.getBoundingClientRect(),
      k = (current.plot.w ?? current.width) / r.width
    const q = current.plot.pick((e.clientX - r.left) * k, (e.clientY - r.top) * k)
    return q ? svg.querySelector(q) : null
  }

  return {
    walk,
    show,
    hide,
    at,
    xi,
    si,
    get marks() {
      return marks
    },
    get active() {
      return active
    },
  }
}

function place(
  svg: SVGSVGElement,
  area: HTMLElement,
  tip: HTMLElement,
  current: ChartCurrent,
  sx: number,
  sy: number,
) {
  const r = svg.getBoundingClientRect(),
    p = area.getBoundingClientRect(),
    cw = area.clientWidth || current.width,
    s = cw / (p.width || cw)
  const k = ((r.width || cw) * s) / (current.plot.w ?? current.width),
    ox = (r.left - p.left) * s
  const tw = tip.offsetWidth || 160,
    th = tip.offsetHeight || 60
  let x = ox + sx * k + 14,
    y = sy * k - th - 10
  if (x + tw > cw) x = ox + sx * k - tw - 14
  if (y < -th * 0.4) y = sy * k + 16
  tip.style.setProperty('--x', `${Math.max(0, x)}px`)
  tip.style.setProperty('--y', `${y}px`)
}
