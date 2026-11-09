// Overlays as actions over native elements (05 §3; components.html:1557-1655, 1575-1599). Each takes the element and
// options and returns { update, destroy }; a binding decides when they are open, these do the platform calls, focus
// and the layer stack.
import { justEscaped, place, pushLayer, type Align, type Side } from './layers'
import { markDevice } from './device'
import { leave, stay } from './motion'

const focusable =
  'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'

/** Options for a dialog. */
export interface DialogOptions {
  open: boolean
  /** Called on every close path the user takes (Escape, backdrop, [data-close]); the binding writes open = false. */
  onClose(): void
  /** Escape's first use inside the dialog (clear a search, go up a level): return true to stay open. */
  onEscape?(): boolean
}

/**
 * A native <dialog> (Modal, AlertDialog, Sheet): showModal() with focus to [autofocus] (else the title, tabindex -1,
 * never a sheet's handle), focus back to the opener on every close path, backdrop press closes unless
 * role="alertdialog", [data-close] buttons close.
 */
export function dialog(el: HTMLDialogElement, opts: DialogOptions) {
  // a sheet shows its grabber (and drops its X) only on a phone or tablet: CSS reads <html data-device>
  markDevice(el.ownerDocument)
  let o = opts
  let opener: HTMLElement | null = null
  let remove: (() => void) | undefined
  const doc = el.ownerDocument
  const layer = () =>
    (remove = pushLayer({
      el,
      modal: true,
      close: () => o.onClose(),
      escape: () => !!o.onEscape?.(),
    }))
  const show = () => {
    // reopened while its exit plays: it never closed, so it only takes its layer back
    const back = stay(el)
    if (remove || (el.open && !back)) return
    if (back) {
      if (el.dataset.state === 'closed') el.dataset.state = 'open'
      layer()
      return
    }
    opener = doc.activeElement as HTMLElement | null
    keepScrollbarRoom(doc)
    el.showModal?.() ?? el.setAttribute('open', '')
    growFrom(el, opener)
    layer()
    const first =
      el.querySelector<HTMLElement>('[autofocus], [data-initial]') ??
      el.querySelector<HTMLElement>('[data-part="title"]')
    if (first && !first.matches(focusable)) first.tabIndex = -1
    first?.focus({ preventScroll: true })
  }
  const hide = () => {
    if (!remove) return
    remove()
    remove = undefined
    const back = opener
    opener = null
    // focus goes back once it has closed: while it is still modal the page behind is inert
    leave(el, () => {
      if (el.open) el.close?.() ?? el.removeAttribute('open')
      if (back?.isConnected) back.focus({ preventScroll: true })
    })
  }
  // Escape: the layer stack already asked to close; the native cancel would close it a second way
  const onCancel = (e: Event) => {
    e.preventDefault()
    if (!justEscaped() && !o.onEscape?.()) o.onClose()
  }
  const onClick = (e: MouseEvent) => {
    if ((e.target as Element).closest?.('[data-close]')) return o.onClose()
    // a press on the backdrop targets the dialog itself, outside its box (keyboard clicks have detail 0: not a press)
    if (e.target !== el || e.detail === 0 || el.getAttribute('role') === 'alertdialog') return
    const r = el.getBoundingClientRect()
    const inside =
      e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
    if (!inside) o.onClose()
  }
  el.addEventListener('cancel', onCancel)
  el.addEventListener('click', onClick)
  if (o.open) show()
  return {
    update(next: DialogOptions) {
      o = next
      if (o.open) show()
      else hide()
    },
    destroy() {
      el.removeEventListener('cancel', onCancel)
      el.removeEventListener('click', onClick)
      remove?.()
    },
  }
}

/** A classic scrollbar, read before the lock takes it: the page keeps its room (warp's html:has(dialog:modal) rule). */
function keepScrollbarRoom(doc: Document) {
  const root = doc.documentElement
  root.toggleAttribute(
    'data-scrollbar',
    doc.defaultView!.innerWidth > root.clientWidth && root.scrollHeight > root.clientHeight,
  )
}

/** Scales a dialog about the control that opened it, so it comes from somewhere. */
function growFrom(el: HTMLElement, opener: HTMLElement | null) {
  if (!opener || opener === el.ownerDocument.body || !opener.getBoundingClientRect) return
  const a = opener.getBoundingClientRect(),
    r = el.getBoundingClientRect()
  el.style.setProperty(
    '--warp-origin',
    `${Math.round(a.left + a.width / 2 - r.left)}px ${Math.round(a.top + a.height / 2 - r.top)}px`,
  )
}

/** Options for a popover. */
export interface PopoverOptions {
  open: boolean
  trigger: HTMLElement
  onClose(): void
  side?: Side | undefined
  align?: Align | undefined
}

/**
 * A non-modal popover (role="dialog", popover="manual"): showPopover, placed by the trigger (bottom start, 8px),
 * data-state="open", focus moves in (first focusable, else the panel itself), focus back to the trigger when it
 * closes by key or button; focus leaving to the outside closes it without restoring focus. [data-close-popover]
 * buttons close.
 */
export function popover(el: HTMLElement, opts: PopoverOptions) {
  let o = opts
  let remove: (() => void) | undefined
  let restore = true
  const win = el.ownerDocument.defaultView!
  const reposition = () =>
    el.matches(':popover-open') && place(el, o.trigger, o.side ?? 'bottom', o.align ?? 'start', 8)
  const layer = () =>
    (remove = pushLayer({
      el,
      trigger: o.trigger,
      close: (reason) => {
        restore = reason === 'escape'
        o.onClose()
      },
    }))
  const show = () => {
    if (remove) return
    const back = stay(el)
    restore = true
    el.dataset.state = 'open'
    layer()
    // reopened while its exit plays: still shown, placed and listening
    if (back) return
    el.showPopover?.()
    place(el, o.trigger, o.side ?? 'bottom', o.align ?? 'start', 8)
    const first =
      el.querySelector<HTMLElement>('[data-initial]') ?? el.querySelector<HTMLElement>(focusable)
    if (first) first.focus({ preventScroll: true })
    else {
      el.tabIndex = -1
      el.focus({ preventScroll: true })
    }
    win.addEventListener('resize', reposition)
    win.addEventListener('scroll', reposition, true)
  }
  const hide = () => {
    if (!remove) return
    remove()
    remove = undefined
    leave(el, () => {
      if (el.matches?.(':popover-open')) el.hidePopover?.()
      win.removeEventListener('resize', reposition)
      win.removeEventListener('scroll', reposition, true)
    })
    if (restore) o.trigger.focus({ preventScroll: true })
  }
  const onFocusOut = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null
    // an ancestor taking focus isn't leaving: a press on plain text in the panel lands on a tabindex="-1" <main>
    if (!remove || !to || el.contains(to) || to.contains(el) || o.trigger.contains(to)) return
    restore = false
    o.onClose()
  }
  const onClick = (e: MouseEvent) => {
    if ((e.target as Element).closest?.('[data-close-popover]')) o.onClose()
  }
  el.addEventListener('focusout', onFocusOut)
  el.addEventListener('click', onClick)
  if (o.open) show()
  return {
    update(next: PopoverOptions) {
      o = next
      if (o.open) show()
      else hide()
    },
    destroy() {
      el.removeEventListener('focusout', onFocusOut)
      el.removeEventListener('click', onClick)
      remove?.()
      win.removeEventListener('resize', reposition)
      win.removeEventListener('scroll', reposition, true)
    },
  }
}

let warmUntil = 0
let current: (() => void) | null = null

function tooltipEvents(
  tip: HTMLElement,
  t: () => HTMLElement,
  show: () => void,
  hide: () => void,
  open: () => boolean,
  later: (fn: () => void, ms: number) => void,
  cancel: () => void,
): [EventTarget, string, (e: never) => void][] {
  return [
    [
      t(),
      'pointerenter',
      (e: PointerEvent) => {
        if (e.pointerType === 'mouse') later(show, performance.now() < warmUntil ? 0 : 500)
      },
    ],
    [
      t(),
      'pointerleave',
      () =>
        later(() => {
          if (!t().matches(':hover') && !tip.matches(':hover')) hide()
        }, 100),
    ],
    [
      tip,
      'pointerleave',
      () =>
        later(() => {
          if (!t().matches(':hover') && !tip.matches(':hover')) hide()
        }, 100),
    ],
    [
      t(),
      'focusin',
      () => {
        if (t().matches(':focus-visible, :has(:focus-visible)')) show()
      },
    ],
    [t(), 'focusout', hide],
    [
      t(),
      'pointerdown',
      (e: PointerEvent) => {
        hide()
        if (e.pointerType !== 'touch') return
        later(() => {
          show()
          later(hide, 1500)
        }, 500)
      },
    ],
    [
      t(),
      'pointerup',
      (e: PointerEvent) => {
        if (e.pointerType === 'touch' && !open()) cancel()
      },
    ],
    [t(), 'pointercancel', () => cancel()],
  ]
}

/**
 * A tooltip (popover="manual", role="tooltip") on its trigger: mouse hover shows after 500ms (at once within 300ms of
 * the last one closing), keyboard focus (:focus-visible) shows, leaving hides after 100ms unless the pointer moved
 * onto the tip, a press hides it; touch long-press (500ms) shows it for 1.5s. One open at a time; Escape closes it
 * (a passive layer: presses pass through).
 */
export function tooltip(
  tip: HTMLElement,
  opts: { trigger: HTMLElement; side?: Side | undefined; align?: Align | undefined },
) {
  let o = opts
  let timer: ReturnType<typeof setTimeout> | undefined
  let remove: (() => void) | undefined
  const open = () => tip.matches?.(':popover-open') ?? false
  const show = () => {
    clearTimeout(timer)
    if (open()) return
    current?.()
    tip.toggleAttribute('data-warm', performance.now() < warmUntil)
    tip.showPopover?.()
    place(tip, o.trigger, o.side ?? 'top', o.align ?? 'center', 6)
    remove = pushLayer({ el: tip, trigger: o.trigger, passive: true, close: hide })
    current = hide
  }
  function hide() {
    clearTimeout(timer)
    remove?.()
    remove = undefined
    if (open()) {
      tip.hidePopover?.()
      warmUntil = performance.now() + 300
    }
    if (current === hide) current = null
  }
  const later = (fn: () => void, ms: number) => {
    clearTimeout(timer)
    timer = setTimeout(fn, ms)
  }
  const t = () => o.trigger
  const on = tooltipEvents(tip, t, show, hide, open, later, () => clearTimeout(timer))
  for (const [target, type, fn] of on) target.addEventListener(type, fn as EventListener)
  return {
    update: (next: typeof opts) => void (o = next),
    destroy() {
      for (const [target, type, fn] of on) target.removeEventListener(type, fn as EventListener)
      hide()
    },
  }
}
