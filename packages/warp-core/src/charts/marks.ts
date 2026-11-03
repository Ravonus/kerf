// Parts every axis form shares: the hairline grid, axes, mark attributes and reference lines (06 §12).
import { s, type Attrs } from './scene'
import { f1, labelWindow } from './math'

const hide = { class: 'grid', 'aria-hidden': 'true' }

export const grid = (ticks: number[], y: (v: number) => number, x0: number, x1: number) =>
  s('g', hide, ticks.map(t => s('line', { x1: x0, x2: x1, y1: f1(y(t)), y2: f1(y(t)), class: t === 0 ? 'zero' : undefined })))

export const yLabels = (ticks: number[], y: (v: number) => number, x0: number, f: (v: number) => string = String) =>
  ticks.map(t => s('text', { x: x0 - 8, y: y(t) + 3.5, 'text-anchor': 'end' }, f(t)))

export const axisY = (ticks: number[], y: (v: number) => number, x0: number, x1: number, f?: (v: number) => string) => [grid(ticks, y, x0, x1), s('g', { class: 'axis', 'aria-hidden': 'true' }, yLabels(ticks, y, x0, f))]

/** Interior labels on the window, both end labels hugging their edge when `ends`. */
export const xLabels = (labels: string[], at: (i: number) => number, y: number, gap: number, width: number, ends = false) => {
  const show = labelWindow(labels.length, Math.max(2, Math.floor(width / gap)))
  return labels.map((l, i) => show.has(i) && s('text', { x: at(i), y, 'text-anchor': ends && i === 0 ? 'start' : ends && i === labels.length - 1 ? 'end' : 'middle' }, l))
}

/** A focusable mark: `role="img"`, its label the same text the tooltip shows, and its place in the x / series walk. */
export const mark = (tag: string, xi: number, si: number, label: string, a: Attrs) => s(tag, { 'data-mark': true, 'data-xi': xi, 'data-si': si, role: 'img', 'aria-label': label, ...a })

export const refLine = (x0: number, x1: number, y: number, label: string, at: number, anchor?: string  ) => [
  s('line', { class: 'ref', x1: x0, x2: x1, y1: y, y2: y }),
  s('text', { class: 'ref-t', x: at, y: y - 6, dy: -2, 'text-anchor': anchor }, label),
]
export const anno = (x: number, y0: number, y1: number, label: string, tx: number, ty: number, anchor?: string  , band?: [number, number]) =>
  s('g', { class: 'anno', 'aria-hidden': 'true' },
    band && s('rect', { class: 'band', x: band[0], y: y0, width: band[1] - band[0], height: y1 - y0 }),
    s('line', { x1: x, x2: x, y1: y0, y2: y1 }), s('text', { x: tx, y: ty, 'text-anchor': anchor }, label))

/**
 * A label over a mark. White or ink on the mid-lightness data colours misses 4.5:1 on several hues, in both themes, so
 * it takes `.ref-t`'s device: its own surface as a halo behind the glyphs (06 §16: text ≥ 4.5:1).
 */
export const halo = 'paint-order:stroke;stroke:var(--warp-color-surface-raised);stroke-width:4px;stroke-linejoin:round'
