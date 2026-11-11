// The site nav's indicator: veneer's phased sweep on one bar. It grows in from an item's leading edge, slides between
// items, and grows out through the trailing edge, so an entry and an exit never run the same way backwards. A stroke
// that has started finishes before it leaves (`usePhaseSweep`'s rule). Only `transform` moves.

/** Options for the sliding nav indicator. */
export interface NavIndicatorOptions {
  /** `x`: a bar under a row of links. `y`: a bar beside a column. */
  axis?: 'x' | 'y'
  /** Light the link whose `#target` is on screen, for a table of contents. */
  spy?: boolean | undefined
}

type Phase = 'idle' | 'in' | 'out'

// The nearest box around the nav that scrolls on its own: a sticky contents column taller than the screen.
function scroller(nav: HTMLElement, win: Window) {
  for (
    let el = nav as HTMLElement | null;
    el && el !== nav.ownerDocument.body;
    el = el.parentElement
  )
    if (
      /auto|scroll/.test(win.getComputedStyle(el).overflowY) &&
      el.scrollHeight > el.clientHeight + 1
    )
      return el
  return undefined
}

// The last heading past the top of the reading band, or the last of all once the page cannot scroll further.
// Read on scroll, since a jump can pass a heading without crossing the band. A contents column taller than the
// screen scrolls along with the page, the same share of its own overflow, so the lit heading stays in view.
function spy(win: Window, doc: Document, nav: HTMLElement, links: () => HTMLAnchorElement[]) {
  const byTarget = new Map<Element, HTMLAnchorElement>()
  for (const a of links()) {
    const el = doc.getElementById(decodeURIComponent(a.hash.slice(1)))
    if (el) byTarget.set(el, a)
  }
  const order = [...byTarget.keys()]
  let queued = 0
  const follow = () => {
    const box = scroller(nav, win)
    if (!box) return
    const room = doc.documentElement.scrollHeight - win.innerHeight
    box.scrollTop = room > 0 ? (win.scrollY / room) * (box.scrollHeight - box.clientHeight) : 0
  }
  const mark = () => {
    queued = 0
    follow()
    const root = doc.documentElement
    const atEnd = win.scrollY > 0 && win.scrollY + win.innerHeight >= root.scrollHeight - 2
    const last = atEnd
      ? order.at(-1)
      : (order.filter((el) => el.getBoundingClientRect().top <= win.innerHeight / 4).at(-1) ??
        order[0])
    const a = last && byTarget.get(last)
    if (!a || a.hasAttribute('aria-current')) return
    for (const x of links()) x.removeAttribute('aria-current')
    a.setAttribute('aria-current', 'location')
  }
  const scrolled = () => {
    queued ||= win.requestAnimationFrame(mark)
  }
  win.addEventListener('scroll', scrolled, { passive: true })
  win.addEventListener('resize', scrolled, { passive: true })
  mark()
  return () => {
    win.removeEventListener('scroll', scrolled)
    win.removeEventListener('resize', scrolled)
    if (queued) win.cancelAnimationFrame(queued)
  }
}

function geometry(nav: HTMLElement, face: HTMLElement, axis: 'x' | 'y') {
  const write = (start: number, size: number, cross = 0) => {
    face.style.transform =
      axis === 'x'
        ? `translate(${start}px, ${cross}px) scaleX(${size})`
        : `translate(${cross}px, ${start}px) scaleY(${size})`
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
  return { write, place, jump }
}

function motion(
  nav: HTMLElement,
  face: HTMLElement,
  axis: 'x' | 'y',
  { place, write, jump }: ReturnType<typeof geometry>,
  {
    target,
    current,
  }: { target: () => HTMLElement | null | undefined; current: () => HTMLElement | null },
) {
  const win = nav.ownerDocument.defaultView!
  let phase: Phase = 'idle'
  let pendingOut = false
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
    if (face.getAnimations().length) {
      pendingOut = true
      return
    }
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
    const item = target()
    if (item) grow(item)
    else shrink()
  }
  const ended = (e: TransitionEvent) => {
    if (e.target !== face) return
    if (pendingOut && !target()) return leave()
    pendingOut = false
    if (phase === 'out') {
      phase = 'idle'
      face.dataset.phase = 'idle'
    }
  }
  // The server's page has the bar on the current link already (CSS, `[aria-current]::after`): take over at that spot.
  const start = () => {
    const now = current()
    if (now) {
      const { start: at, size } = place(now)
      jump(at, size)
      phase = 'in'
      face.dataset.phase = 'in'
    }
    nav.dataset.ready = ''
  }
  return { settle, ended, start }
}

function tracking(nav: HTMLElement, current: () => HTMLElement | null, settle: () => void) {
  let hovered: HTMLElement | undefined
  let focused: HTMLElement | undefined
  const link = (t: EventTarget | null) =>
    (t as Element | null)?.closest?.('a[href]') as HTMLElement | null
  const over = (e: Event) => {
    const a = link(e.target)
    if (a && a !== hovered) {
      hovered = a
      settle()
    }
  }
  const off = (e: PointerEvent) => {
    if (!nav.contains(e.relatedTarget as Node)) {
      hovered = undefined
      settle()
    }
  }
  const focus = (e: Event) => {
    const a = link(e.target)
    if (a?.matches(':focus-visible')) {
      focused = a
      settle()
    }
  }
  const blur = (e: FocusEvent) => {
    if (!nav.contains(e.relatedTarget as Node)) {
      focused = undefined
      settle()
    }
  }
  return { over, pointerOut: off, focus, blur, target: () => hovered ?? focused ?? current() }
}

/** Slides an indicator to the hovered, focused or current nav item. */
export function navIndicator(nav: HTMLElement, opts: NavIndicatorOptions = {}) {
  const axis = opts.axis ?? 'x'
  const win = nav.ownerDocument.defaultView!
  const doc = nav.ownerDocument
  const face = nav.querySelector<HTMLElement>(':scope > [data-part="indicator"]')!
  const links = () => [...nav.querySelectorAll<HTMLAnchorElement>('a[href]')]
  const current = () => nav.querySelector<HTMLElement>('a[aria-current]')
  const geo = geometry(nav, face, axis)
  const tracked = tracking(nav, current, () => settle())
  const { over, pointerOut: off, focus, blur, target } = tracked
  const { settle, ended, start } = motion(nav, face, axis, geo, { target, current })
  nav.addEventListener('pointerover', over)
  nav.addEventListener('pointerout', off)
  nav.addEventListener('focusin', focus)
  nav.addEventListener('focusout', blur)
  face.addEventListener('transitionend', ended)

  // At the frame, once layout is due anyway. Measuring now would force it in the middle of building the page.
  const first = win.requestAnimationFrame(start)

  const seen = new win.MutationObserver(settle)
  seen.observe(nav, { subtree: true, attributes: true, attributeFilter: ['aria-current'] })
  const resized =
    typeof win.ResizeObserver === 'function'
      ? new win.ResizeObserver(() => {
          const t = target()
          if (t) {
            const { start: at, size } = geo.place(t)
            geo.jump(at, size)
          }
        })
      : undefined
  resized?.observe(nav)
  const onDial = () =>
    win.requestAnimationFrame(() => {
      const t = current()
      if (t) {
        const { start: at, size } = geo.place(t)
        geo.jump(at, size)
      }
    })
  doc.addEventListener('veneer:dial', onDial)

  const unspy = opts.spy ? spy(win, doc, nav, links) : undefined

  return {
    update() {
      settle()
    },
    destroy() {
      win.cancelAnimationFrame(first)
      seen.disconnect()
      resized?.disconnect()
      unspy?.()
      doc.removeEventListener('veneer:dial', onDial)
      nav.removeEventListener('pointerover', over)
      nav.removeEventListener('pointerout', off)
      nav.removeEventListener('focusin', focus)
      nav.removeEventListener('focusout', blur)
      face.removeEventListener('transitionend', ended)
    },
  }
}
