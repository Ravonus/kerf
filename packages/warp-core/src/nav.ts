// The site nav's indicator: warp's phased sweep on one bar. It grows in from an item's leading edge, slides between
// items, and grows out through the trailing edge, so an entry and an exit never run the same way backwards. A stroke
// that has started finishes before it leaves (`usePhaseSweep`'s rule). Only `transform` moves.

export interface NavIndicatorOptions {
  /** `x`: a bar under a row of links. `y`: a bar beside a column. */
  axis?: 'x' | 'y'
  /** Light the link whose `#target` is on screen, for a table of contents. */
  spy?: boolean
}

type Phase = 'idle' | 'in' | 'out'

export function navIndicator(nav: HTMLElement, opts: NavIndicatorOptions = {}) {
  const axis = opts.axis ?? 'x'
  const win = nav.ownerDocument.defaultView!
  const doc = nav.ownerDocument
  const face = nav.querySelector<HTMLElement>(':scope > [data-part="indicator"]')!
  const links = () => [...nav.querySelectorAll<HTMLAnchorElement>('a[href]')]
  const current = () => nav.querySelector<HTMLElement>('a[aria-current]')
  let phase: Phase = 'idle'
  let hovered: HTMLElement | undefined
  let focused: HTMLElement | undefined
  let pendingOut = false

  const write = (start: number, size: number, cross = 0) => {
    face.style.transform = axis === 'x' ? `translate(${start}px, ${cross}px) scaleX(${size})` : `translate(${cross}px, ${start}px) scaleY(${size})`
  }
  const place = (item: HTMLElement) => {
    const a = item.getBoundingClientRect()
    const box = nav.getBoundingClientRect()
    return axis === 'x'
      ? { start: a.left - box.left - nav.clientLeft + nav.scrollLeft, size: a.width }
      : { start: a.top - box.top - nav.clientTop + nav.scrollTop, size: a.height }
  }
  /** Without a transition: the next change is what moves. */
  const jump = (start: number, size: number) => {
    face.setAttribute('data-instant', '')
    write(start, size)
    void face.offsetWidth
    face.removeAttribute('data-instant')
  }
  const grow = (item: HTMLElement) => {
    const { start, size } = place(item)
    if (phase === 'idle') jump(start, 0)
    phase = 'in'
    pendingOut = false
    face.dataset.phase = 'in'
    write(start, size)
  }
  const shrink = () => {
    if (phase !== 'in') return
    if (face.getAnimations().length) { pendingOut = true; return }
    leave()
  }
  const leave = () => {
    pendingOut = false
    const m = new win.DOMMatrix(win.getComputedStyle(face).transform)
    const start = axis === 'x' ? m.m41 : m.m42
    const size = axis === 'x' ? m.m11 : m.m22
    phase = 'out'
    face.dataset.phase = 'out'
    write(start + size, 0)
  }
  const settle = () => {
    const target = hovered ?? focused ?? current()
    if (target) grow(target)
    else shrink()
  }
  const ended = (e: TransitionEvent) => {
    if (e.target !== face) return
    if (pendingOut && !(hovered ?? focused ?? current())) return leave()
    pendingOut = false
    if (phase === 'out') { phase = 'idle'; face.dataset.phase = 'idle' }
  }
  const link = (t: EventTarget | null) => (t as Element | null)?.closest?.('a[href]') as HTMLElement | null
  const over = (e: Event) => { const a = link(e.target); if (a && a !== hovered) { hovered = a; settle() } }
  const off = (e: PointerEvent) => { if (!nav.contains(e.relatedTarget as Node)) { hovered = undefined; settle() } }
  const focus = (e: Event) => { const a = link(e.target); if (a?.matches(':focus-visible')) { focused = a; settle() } }
  const blur = (e: FocusEvent) => { if (!nav.contains(e.relatedTarget as Node)) { focused = undefined; settle() } }
  nav.addEventListener('pointerover', over)
  nav.addEventListener('pointerout', off)
  nav.addEventListener('focusin', focus)
  nav.addEventListener('focusout', blur)
  face.addEventListener('transitionend', ended)

  // The server's page has the bar on the current link already (CSS, `[aria-current]::after`): take over at that spot.
  const start = () => {
    const now = current()
    if (now) {
      const { start, size } = place(now)
      jump(start, size)
      phase = 'in'
      face.dataset.phase = 'in'
    }
    nav.dataset.ready = ''
  }
  // At the frame, once layout is due anyway. Measuring now would force it in the middle of building the page.
  const first = win.requestAnimationFrame(start)

  const seen = new win.MutationObserver(settle)
  seen.observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-current'] })
  const resized = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => { const t = hovered ?? focused ?? current(); if (t) { const { start, size } = place(t); jump(start, size) } }) : undefined
  resized?.observe(nav)
  const onDial = () => win.requestAnimationFrame(() => { const t = current(); if (t) { const { start, size } = place(t); jump(start, size) } })
  doc.addEventListener('warp:dial', onDial)

  // The heading nearest the top of the reading band.
  let spy: IntersectionObserver | undefined
  if (opts.spy && typeof win.IntersectionObserver === 'function') {
    const visible = new Set<Element>()
    const byTarget = new Map<Element, HTMLAnchorElement>()
    for (const a of links()) {
      const el = doc.getElementById(decodeURIComponent(a.hash.slice(1)))
      if (el) byTarget.set(el, a)
    }
    const order = [...byTarget.keys()]
    spy = new win.IntersectionObserver(list => {
      for (const e of list) (e.isIntersecting || e.boundingClientRect.top < 0 ? visible.add(e.target) : visible.delete(e.target))
      const last = order.filter(el => visible.has(el)).at(-1) ?? order[0]
      const a = last && byTarget.get(last)
      if (!a || a.hasAttribute('aria-current')) return
      for (const x of links()) x.removeAttribute('aria-current')
      a.setAttribute('aria-current', 'location')
    }, { rootMargin: '0px 0px -75% 0px' })
    for (const el of order) spy.observe(el)
  }

  return {
    update() { settle() },
    destroy() {
      win.cancelAnimationFrame(first)
      seen.disconnect(); resized?.disconnect(); spy?.disconnect()
      doc.removeEventListener('warp:dial', onDial)
      nav.removeEventListener('pointerover', over); nav.removeEventListener('pointerout', off)
      nav.removeEventListener('focusin', focus); nav.removeEventListener('focusout', blur)
      face.removeEventListener('transitionend', ended)
    },
  }
}
