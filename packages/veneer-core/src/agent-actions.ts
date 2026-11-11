import { place, pushLayer } from './layers'
import { announce } from './toast'
import { installSweep } from './sweep'

// ---- actions ---------------------------------------------------------------------------------------------------------

/** Options for sticking to the bottom: how near counts, and who hears when the reader moves away. */
export interface StickOptions {
  threshold?: number
  onAway(away: boolean): void
}

/**
 * Keep a scroller at its bottom while the user is within `threshold` px of it (48, 07 §1.3). Reports when they leave,
 * so a binding can show Jump to latest. New content never moves someone who has scrolled up.
 */
export function stick(el: HTMLElement, opts: StickOptions) {
  let o = opts
  let pinned = true
  const win = el.ownerDocument.defaultView as Window & typeof globalThis
  const near = () => el.scrollHeight - el.scrollTop - el.clientHeight <= (o.threshold ?? 48)
  const bottom = () => {
    el.scrollTop = el.scrollHeight
  }
  const grew = () => {
    if (pinned) bottom()
    else o.onAway(!near())
  }
  const onScroll = () => {
    pinned = near()
    o.onAway(!pinned)
  }
  el.addEventListener('scroll', onScroll, { passive: true })
  const mo = new win.MutationObserver(grew)
  mo.observe(el, { subtree: true, childList: true, characterData: true })
  const ro = win.ResizeObserver ? new win.ResizeObserver(grew) : undefined
  ro?.observe(el)
  bottom()
  return {
    update(next: StickOptions) {
      o = next
    },
    destroy() {
      el.removeEventListener('scroll', onScroll)
      mo.disconnect()
      ro?.disconnect()
    },
  }
}

/** Options for a citation link: the panel it opens, and who hears when it does. */
export interface CiteOptions {
  panel: HTMLElement
  onOpen(open: boolean): void
}

/** The preview of a citation (07 §1.3): opens on hover and keyboard focus, stays while the pointer or focus is in it. */
export function citePreview(link: HTMLElement, opts: CiteOptions) {
  let o = opts
  let timer: ReturnType<typeof setTimeout> | undefined
  let remove: (() => void) | undefined
  const later = (fn: () => void, ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }
  const inside = (n: EventTarget | null) =>
    n instanceof Node && (o.panel.contains(n) || link.contains(n))
  function hide() {
    clearTimeout(timer)
    if (!remove) return
    remove()
    remove = undefined
    if (o.panel.matches?.(':popover-open')) o.panel.hidePopover?.()
    o.onOpen(false)
  }
  const show = () => {
    clearTimeout(timer)
    if (remove) return
    o.panel.showPopover?.()
    place(o.panel, link, 'top', 'start', 6)
    remove = pushLayer({ el: o.panel, trigger: link, passive: true, close: hide })
    o.onOpen(true)
  }
  const leave = () =>
    later(() => {
      if (
        !link.matches(':hover') &&
        !o.panel.matches(':hover') &&
        !o.panel.contains(link.ownerDocument.activeElement) &&
        link.ownerDocument.activeElement !== link
      )
        hide()
    }, 120)
  const enter = (e: PointerEvent) => {
    if (e.pointerType !== 'touch') later(show, 250)
  }
  const focus = () => {
    if (link.matches(':focus-visible')) show()
  }
  const out = (e: FocusEvent) => {
    if (!inside(e.relatedTarget)) hide()
  }
  const on: [EventTarget, string, (e: never) => void][] = [
    [link, 'pointerenter', enter],
    [link, 'pointerleave', leave],
    [o.panel, 'pointerleave', leave],
    [link, 'focusin', focus],
    [link, 'focusout', out],
    [o.panel, 'focusout', out],
    [link, 'click', hide],
  ]
  for (const [t, n, f] of on) t.addEventListener(n, f as EventListener)
  return {
    update(next: CiteOptions) {
      o = next
    },
    destroy() {
      for (const [t, n, f] of on) t.removeEventListener(n, f as EventListener)
      clearTimeout(timer)
      remove?.()
    },
  }
}

/** Where `field-sizing: content` is missing, grow a textarea by hand; its CSS max still caps it at 8 lines. */
export function autosize(el: HTMLTextAreaElement, _value?: string) {
  const css = el.ownerDocument.defaultView?.CSS
  const native = !css?.supports || css.supports('field-sizing', 'content')
  const fit = () => {
    if (native) return
    el.style.height = 'auto'
    el.style.height = `${el.scrollHeight}px`
  }
  el.addEventListener('input', fit)
  fit()
  return { update: fit, destroy: () => el.removeEventListener('input', fit) }
}

/** Copy, confirm one sweep on `host`, and say so (05 Copy, 07 §6.4). */
export async function copyConfirm(el: Element, text: string, host: Element = el) {
  const doc = el.ownerDocument
  try {
    await doc.defaultView?.navigator.clipboard?.writeText(text)
    installSweep(doc).confirm(host)
    announce(doc, 'Copied to clipboard')
  } catch {
    announce(doc, 'Could not copy', true)
  }
}

/** The listening wave: the newest level enters at the start and the bars carry it along. */
export function speechWave(el: HTMLElement, _level?: number) {
  const bars = [...el.children] as HTMLElement[]
  const values = bars.map(() => 0)
  const push = (v: number) => {
    values.pop()
    values.unshift(v)
    bars.forEach((b, i) => b.style.setProperty('--a', values[i]!.toFixed(2)))
  }
  return { update: push, destroy() {} }
}
