// The one chart behaviour (06 §1.3, §4, §12): `chart(figure, { form, cfg })` adopts the markup a binding rendered (the
// server's or a client's) and from then on owns the plot. One tab stop; ←/→ walk x, ↑/↓ change series, Home/End jump;
// the tooltip follows hover, tap-and-drag and focus, Escape closes it. Width changes and data changes lay out again
// and patch attributes in place. The legend, the chart | table toggle and the enter motion are delegated from the
// figure, so a binding only has to render the markup.
import { esc, patch, play } from './scene'
import { f1 } from './math'
import { sparkPoints, sparkScene } from './spark'
import type { Ctx, Form, Plot, TableData, Tip } from './types'

/** The width a chart lays out at when nothing can be measured (the server's first pass). */
export const SSR_WIDTH = 640
/** `--warp-radius-mark` at the default stop: what the server lays out with. */
export const SSR_RADIUS = 3

type Live = { near: boolean; dirty: boolean; redraw(): void }
const live = new Set<Live>()
const lookup = new Map<string, number>()
let dials: MutationObserver | undefined
let draining = false

function probe(el: Element, token: string, prop: 'borderTopLeftRadius' | 'transitionDuration') {
  const key = token + prop
  if (!lookup.has(key)) {
    const t = el.ownerDocument.createElement('i')
    t.style.cssText = `position:absolute;${prop === 'transitionDuration' ? 'transition-duration' : 'border-top-left-radius'}:var(${token})`
    el.append(t)
    lookup.set(key, parseFloat(getComputedStyle(t)[prop]) || 0)
    t.remove()
  }
  return lookup.get(key)!
}
const radius = (el: Element) => probe(el, '--warp-radius-mark', 'borderTopLeftRadius')

// One chart per idle slice, so a dial switch never holds a long task for what is off screen (06 §4).
function drain() {
  if (draining) return
  draining = true
  const idle = (f: (d: { timeRemaining(): number }) => void) =>
    typeof requestIdleCallback === 'function'
      ? requestIdleCallback(f, { timeout: 1500 })
      : setTimeout(() => f({ timeRemaining: () => 8 }), 32)
  idle(function slice(d) {
    for (const c of live) {
      if (!c.dirty) continue
      if (d.timeRemaining() < 4) return void idle(slice)
      c.dirty = false
      c.redraw()
    }
    draining = false
  })
}

function watchDials() {
  if (dials || typeof MutationObserver === 'undefined') return
  dials = new MutationObserver(() => {
    lookup.clear()
    for (const c of live) {
      if (c.near) c.redraw()
      else c.dirty = true
    }
    drain()
  })
  // a theme change redraws nothing: every mark paints with var(--warp-color-*)
  dials.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-expression', 'data-density', 'data-form', 'data-pointer'],
  })
}

// the dim of a row that isn't the hovered series: .6 in the specimen, 4.41:1 on the overlay, so .62
const tipHTML = ({ title, rows = [] }: Tip) =>
  (title === undefined ? '' : `<div data-part="tip-title">${esc(title)}</div>`) +
  rows
    .map(
      ([c, l, v, dim]) =>
        `<div data-part="tip-row" style="--_dc:${c}${dim ? ';opacity:.62' : ''}"><i></i>${esc(l)}<b>${esc(v)}</b></div>`,
    )
    .join('')

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
  let form = o.form,
    cfg = o.cfg,
    plot: Plot,
    width = Number(svg.getAttribute('width')) || SSR_WIDTH,
    marks: Element[] = []
  let active: Element | null = null,
    touch = false,
    stop = () => {},
    enterTimer: ReturnType<typeof setTimeout> | undefined

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

  function draw(tween = false) {
    ctx.r = radius(fig)
    plot = form.plot(cfg, width, ctx)
    const w = plot.w ?? width
    if (svg.getAttribute('height') !== String(plot.h) || svg.getAttribute('width') !== String(w)) {
      svg.setAttribute('viewBox', `0 0 ${w} ${plot.h}`)
      svg.setAttribute('width', String(w))
      svg.setAttribute('height', String(plot.h))
    }
    if (plot.style !== undefined && svg.getAttribute('style') !== plot.style)
      svg.setAttribute('style', plot.style)
    stop()
    const queue: Parameters<typeof patch>[2] = tween ? [] : undefined
    patch(svg, plot.body, queue)
    stop = queue ? play(queue, duration()) : () => {}
    walk()
  }
  // quiet swaps in place and reduced motion lands at once (06 §4); else the specimen's 2.2 × the tween token
  const duration = () => {
    const cs = getComputedStyle(fig)
    return cs.getPropertyValue('--warp-ref-data-fade').trim() === '0' ||
      cs.getPropertyValue('--warp-motion-scale').trim() === '0'
      ? 0
      : probe(fig, '--warp-data-tween', 'transitionDuration') * 1000 * 2.2
  }

  const place = (sx: number, sy: number) => {
    const r = svg.getBoundingClientRect(),
      p = area.getBoundingClientRect(),
      cw = area.clientWidth || width,
      s = cw / (p.width || cw)
    const k = ((r.width || cw) * s) / (plot.w ?? width),
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
  function show(m: Element, viaKey?: boolean) {
    if (active && active !== m) active.removeAttribute('data-active')
    active = m
    m.setAttribute('data-active', '')
    // oxlint-disable-next-line weft/no-html-sink -- tipHTML escapes every value it writes
    tip.innerHTML = tipHTML(
      plot.tip?.(xi(m), si(m), m) ?? { title: m.getAttribute('aria-label') ?? '' },
    )
    tip.setAttribute('data-open', '')
    fig.setAttribute('data-hot', '')
    plot.on?.(m, svg)
    const b = (m as SVGGraphicsElement).getBBox?.() ?? { x: 0, y: 0, width: 0, height: 0 }
    place(b.x + b.width / 2, b.y)
    if (viaKey) for (const x of marks) x.setAttribute('tabindex', x === m ? '0' : '-1')
  }
  function hide() {
    active?.removeAttribute('data-active')
    active = null
    tip.removeAttribute('data-open')
    fig.removeAttribute('data-hot')
    plot.on?.(null, svg)
  }
  const at = (e: PointerEvent) => {
    if (!plot.pick) return (e.target as Element).closest?.('[data-mark]') ?? null
    const r = svg.getBoundingClientRect(),
      k = (plot.w ?? width) / r.width
    const q = plot.pick((e.clientX - r.left) * k, (e.clientY - r.top) * k)
    return q ? svg.querySelector(q) : null
  }
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
    else if (!plot.pick) hide()
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
  function key(e: KeyboardEvent) {
    const m = (e.target as Element).closest?.('[data-mark]')
    if (!m) return
    const x = xi(m),
      y = si(m),
      find = (fx: number, fs: number) => marks.find((n) => xi(n) === fx && si(n) === fs)
    const xs = [...new Set(marks.map(xi))],
      ys = [...new Set(marks.map(si))],
      px = xs.indexOf(x),
      py = ys.indexOf(y),
      i = marks.indexOf(m)
    let next: Element | undefined
    if (e.key === 'ArrowRight')
      next =
        find(xs[Math.min(xs.length - 1, px + 1)]!, y) ?? marks[Math.min(marks.length - 1, i + 1)]
    else if (e.key === 'ArrowLeft')
      next = find(xs[Math.max(0, px - 1)]!, y) ?? marks[Math.max(0, i - 1)]
    else if (e.key === 'ArrowUp') next = find(x, ys[Math.max(0, py - 1)]!)
    else if (e.key === 'ArrowDown') next = find(x, ys[Math.min(ys.length - 1, py + 1)]!)
    else if (e.key === 'Home') next = marks[0]
    else if (e.key === 'End') next = marks[marks.length - 1]
    else if (e.key === 'Escape') return hide()
    else return
    e.preventDefault()
    ;(next as SVGElement | undefined)?.focus()
  }

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
      draw()
    }
  }
  function over(e: Event) {
    const b = (e.target as Element).closest?.('[data-scope="legend"] button') as HTMLElement | null
    if (!b) return
    if (form.byMark) {
      const m = svg.querySelector(`[data-mark][data-xi="${b.dataset.si}"]`)
      if (m) show(m)
    } else isolate(Number(b.dataset.si))
  }
  function out(e: Event) {
    if (!(e.target as Element).closest?.('[data-scope="legend"] button')) return
    if (form.byMark) hide()
    else isolate(null)
  }

  const enter = (replay?: boolean) => {
    if (replay) {
      fig.removeAttribute('data-enter')
      void fig.getBoundingClientRect()
    }
    fig.dataset.enter = 'run'
    clearTimeout(enterTimer)
    enterTimer = setTimeout(() => fig.removeAttribute('data-enter'), 1900)
  }
  const self: Live = { near: true, dirty: false, redraw: () => draw() }
  const view =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (es) => {
            for (const e of es) {
              self.near = e.isIntersecting
              if (self.near && self.dirty) {
                self.dirty = false
                draw()
              }
            }
          },
          { rootMargin: '300px 0px' },
        )
  // The markup arrives with data-enter="wait" and its motion already playing. Off screen that would be wasted, so it
  // is taken off until the chart is a quarter in view: once, on first view, never again on a resize redraw.
  const seen =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(
          (es) => {
            if (es[es.length - 1]!.isIntersecting) {
              enter()
              seen!.disconnect()
            } else fig.removeAttribute('data-enter')
          },
          { threshold: 0.25 },
        )
  const size =
    typeof ResizeObserver === 'undefined'
      ? null
      : new ResizeObserver(() => {
          const w = Math.round(area.clientWidth)
          if (!w || (w === width && radius(fig) === ctx.r)) return
          width = w
          if (self.near) draw()
          else {
            self.dirty = true
            drain()
          }
        })

  plot = form.plot(cfg, width, ctx)
  walk()
  fig.addEventListener('click', click)
  fig.addEventListener('pointerover', over)
  fig.addEventListener('pointerout', out)
  // on the wrapper: a focus listener on an <svg> makes Chromium focus it on click
  area.addEventListener('focusin', focusIn)
  area.addEventListener('focusout', focusOut)
  area.addEventListener('keydown', key)
  svg.addEventListener('pointermove', move)
  svg.addEventListener('pointerdown', down)
  svg.addEventListener('pointerup', up)
  svg.addEventListener('pointerleave', leave)
  document.addEventListener('pointerdown', outside)
  view?.observe(fig)
  seen?.observe(fig)
  size?.observe(area)
  live.add(self)
  watchDials()
  const unbehave = form.behave?.({ svg, ctx, draw: () => draw() })

  return {
    update(n: ChartOptions<C>) {
      const swap = (n.cfg as { layout?: unknown }).layout !== (cfg as { layout?: unknown }).layout
      form = n.form
      cfg = n.cfg
      if (swap) enter(true)
      draw(!swap && !form.live)
      if (active && !active.isConnected) hide()
    },
    destroy() {
      stop()
      clearTimeout(enterTimer)
      unbehave?.()
      view?.disconnect()
      seen?.disconnect()
      size?.disconnect()
      document.removeEventListener('pointerdown', outside)
      live.delete(self)
      if (!live.size) {
        dials?.disconnect()
        dials = undefined
      }
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
