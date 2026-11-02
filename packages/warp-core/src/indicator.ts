// The sliding indicator of Segmented (inputs.html seg(), 1277-1284) and Tabs (components.html tabs(), 1821-1849): one
// face measured from the selected item, moved as a shuttle (redesign §3): head first, tail after. The first placement
// and re-measures on resize are instant (data-instant, dropped after two frames).
import { moveShuttle } from './shuttle'

export interface IndicatorOptions {
  /** The selected item, inside the container (Segmented: the checked radio's label; Tabs: the selected tab). */
  selected: string
  /** Unused since the shuttle: it writes --warp-a and --warp-b. Kept so older calls still type-check. */
  x?: string
  w?: string
}

export function indicator(container: HTMLElement, opts: IndicatorOptions) {
  let o = opts
  const win = container.ownerDocument.defaultView!
  const face = () => container.querySelector<HTMLElement>(':scope > [data-part="indicator"]')
  const measure = (instant: boolean) => {
    const el = face()
    const item = container.querySelector<HTMLElement>(o.selected)
    if (!el || !item) return
    if (instant) el.setAttribute('data-instant', '')
    moveShuttle(el, item.offsetLeft, item.offsetLeft + item.offsetWidth)
    if (instant) win.requestAnimationFrame(() => win.requestAnimationFrame(() => el.removeAttribute('data-instant')))
  }
  const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => measure(true)) : null
  resize?.observe(container)
  const first = win.requestAnimationFrame(() => measure(true))
  // a dial change resizes faces without resizing the container
  const onDial = () => win.requestAnimationFrame(() => measure(true))
  container.ownerDocument.addEventListener('warp:dial', onDial)
  return {
    /** Move to the (new) selected item, on the sweep curve. */
    update(next?: IndicatorOptions) { if (next) o = next; measure(false) },
    destroy() {
      win.cancelAnimationFrame(first)
      resize?.disconnect()
      container.ownerDocument.removeEventListener('warp:dial', onDial)
    },
  }
}

/**
 * A scrolling tablist: data-overflow="start end" (CSS edge fades) from the scroll position, and the selected tab
 * scrolled into view with a 24px margin.
 */
export function overflow(list: HTMLElement) {
  const write = () => {
    const parts = []
    if (list.scrollLeft > 1) parts.push('start')
    if (list.scrollLeft + list.clientWidth < list.scrollWidth - 1) parts.push('end')
    if (parts.length) list.dataset.overflow = parts.join(' ')
    else delete list.dataset.overflow
  }
  const win = list.ownerDocument.defaultView!
  const resize = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(write) : null
  resize?.observe(list)
  list.addEventListener('scroll', write, { passive: true })
  return {
    /** Bring `tab` into view (smooth unless reduced motion) and refresh the fades. */
    update(tab?: HTMLElement | null) {
      if (tab && list.scrollWidth > list.clientWidth) {
        const left = tab.offsetLeft - 24, right = tab.offsetLeft + tab.offsetWidth + 24
        const to = left < list.scrollLeft ? left : right > list.scrollLeft + list.clientWidth ? right - list.clientWidth : null
        if (to !== null) list.scrollTo?.({ left: to, behavior: win.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' })
      }
      write()
    },
    destroy() {
      resize?.disconnect()
      list.removeEventListener('scroll', write)
    },
  }
}

/**
 * A box whose child scrolls sideways (a board, a timeline) and an overlay scrollbar that shows nothing until it moves:
 * data-overflow="start end" on `host` (the scroller's parent by default, a `[data-scope="edges"]`) says which sides have
 * more, and the host draws an edge shadow there, as a wide table does. It follows the scroll, the box's size and its
 * content growing (a column added) while the box stays put.
 */
export function edges(scroller: HTMLElement, host: HTMLElement | undefined = scroller.parentElement ?? scroller) {
  const at = host ?? scroller
  const write = () => {
    const x = Math.abs(scroller.scrollLeft) // negative in rtl
    const parts = []
    if (x > 1) parts.push('start')
    if (x + scroller.clientWidth < scroller.scrollWidth - 1) parts.push('end')
    const next = parts.join(' ')
    if ((at.dataset.overflow ?? '') !== next) { if (next) at.dataset.overflow = next; else delete at.dataset.overflow }
  }
  const win = scroller.ownerDocument.defaultView!
  const sizes = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(write) : null
  const watchKids = () => { if (!sizes) return; sizes.disconnect(); sizes.observe(scroller); for (const c of scroller.children) sizes.observe(c) }
  const kids = sizes && typeof win.MutationObserver === 'function' ? new win.MutationObserver(watchKids) : null
  kids?.observe(scroller, { childList: true })
  watchKids()
  scroller.addEventListener('scroll', write, { passive: true })
  write()
  return {
    update() { write() },
    destroy() {
      sizes?.disconnect()
      kids?.disconnect()
      scroller.removeEventListener('scroll', write)
    },
  }
}
