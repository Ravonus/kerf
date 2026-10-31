// Overlays as actions over native elements (05 §3; components.html:1557-1655, 1575-1599). Each takes the element and
// options and returns { update, destroy }; a binding decides when they are open, these do the platform calls, focus
// and the layer stack.
import { justEscaped, place, pushLayer, type Align, type Side } from './layers'

const focusable = 'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex="-1"])'

export interface DialogOptions {
  open: boolean
  /** Called on every close path the user takes (Escape, backdrop, [data-close]); the binding writes open = false. */
  onClose(): void
}

/**
 * A native <dialog> (Modal, AlertDialog, Sheet): showModal() with focus to [autofocus] (else the title, tabindex -1,
 * never a sheet's handle), focus back to the opener on every close path, backdrop press closes unless
 * role="alertdialog", [data-close] buttons close.
 */
export function dialog(el: HTMLDialogElement, opts: DialogOptions) {
  let o = opts
  let opener: HTMLElement | null = null
  let remove: (() => void) | undefined
  const doc = el.ownerDocument
  const show = () => {
    if (el.open) return
    opener = doc.activeElement as HTMLElement | null
    el.showModal?.() ?? el.setAttribute('open', '')
    remove = pushLayer({ el, modal: true, close: () => o.onClose() })
    const first = el.querySelector<HTMLElement>('[autofocus], [data-initial]') ?? el.querySelector<HTMLElement>('[data-part="title"]')
    if (first && !first.matches(focusable)) first.tabIndex = -1
    first?.focus({ preventScroll: true })
  }
  const hide = () => {
    remove?.()
    remove = undefined
    if (el.open) el.close?.() ?? el.removeAttribute('open')
    if (opener?.isConnected) opener.focus({ preventScroll: true })
    opener = null
  }
  // Escape: the layer stack already asked to close; the native cancel would close it a second way
  const onCancel = (e: Event) => { e.preventDefault(); if (!justEscaped()) o.onClose() }
  const onClick = (e: MouseEvent) => {
    if ((e.target as Element).closest('[data-close]')) return o.onClose()
    // a press on the backdrop targets the dialog itself, outside its box (keyboard clicks have detail 0: not a press)
    if (e.target !== el || e.detail === 0 || el.getAttribute('role') === 'alertdialog') return
    const r = el.getBoundingClientRect()
    const inside = e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom
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

export interface PopoverOptions {
  open: boolean
  trigger: HTMLElement
  onClose(): void
  side?: Side
  align?: Align
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
  const reposition = () => el.matches(':popover-open') && place(el, o.trigger, o.side ?? 'bottom', o.align ?? 'start', 8)
  const show = () => {
    if (remove) return
    restore = true
    el.dataset.state = 'open'
    el.showPopover?.()
    place(el, o.trigger, o.side ?? 'bottom', o.align ?? 'start', 8)
    remove = pushLayer({ el, trigger: o.trigger, close: reason => { restore = reason === 'escape'; o.onClose() } })
    const first = el.querySelector<HTMLElement>('[data-initial]') ?? el.querySelector<HTMLElement>(focusable)
    if (first) first.focus({ preventScroll: true })
    else { el.tabIndex = -1; el.focus({ preventScroll: true }) }
    win.addEventListener('resize', reposition)
    win.addEventListener('scroll', reposition, true)
  }
  const hide = () => {
    if (!remove) return
    remove()
    remove = undefined
    delete el.dataset.state
    if (el.matches?.(':popover-open')) el.hidePopover?.()
    win.removeEventListener('resize', reposition)
    win.removeEventListener('scroll', reposition, true)
    if (restore) o.trigger.focus({ preventScroll: true })
  }
  const onFocusOut = (e: FocusEvent) => {
    const to = e.relatedTarget as Node | null
    if (!remove || !to || el.contains(to) || o.trigger.contains(to)) return
    restore = false
    o.onClose()
  }
  const onClick = (e: MouseEvent) => { if ((e.target as Element).closest('[data-close-popover]')) o.onClose() }
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

/**
 * A tooltip (popover="manual", role="tooltip") on its trigger: mouse hover shows after 500ms (at once within 300ms of
 * the last one closing), keyboard focus (:focus-visible) shows, leaving hides after 100ms unless the pointer moved
 * onto the tip, a press hides it; touch long-press (500ms) shows it for 1.5s. One open at a time; Escape closes it
 * (a passive layer: presses pass through).
 */
export function tooltip(tip: HTMLElement, opts: { trigger: HTMLElement; side?: Side }) {
  let o = opts
  let timer: ReturnType<typeof setTimeout> | undefined
  let remove: (() => void) | undefined
  const open = () => tip.matches?.(':popover-open') ?? false
  const show = () => {
    clearTimeout(timer)
    if (open()) return
    current?.()
    tip.showPopover?.()
    place(tip, o.trigger, o.side ?? 'top', 'center', 6)
    remove = pushLayer({ el: tip, trigger: o.trigger, passive: true, close: hide })
    current = hide
  }
  function hide() {
    clearTimeout(timer)
    remove?.()
    remove = undefined
    if (open()) { tip.hidePopover?.(); warmUntil = performance.now() + 300 }
    if (current === hide) current = null
  }
  const later = (fn: () => void, ms: number) => { clearTimeout(timer); timer = setTimeout(fn, ms) }
  const t = () => o.trigger
  const on: [EventTarget, string, (e: any) => void][] = [
    [t(), 'pointerenter', (e: PointerEvent) => { if (e.pointerType === 'mouse') later(show, performance.now() < warmUntil ? 0 : 500) }],
    [t(), 'pointerleave', () => later(() => { if (!t().matches(':hover') && !tip.matches(':hover')) hide() }, 100)],
    [tip, 'pointerleave', () => later(() => { if (!t().matches(':hover') && !tip.matches(':hover')) hide() }, 100)],
    [t(), 'focusin', () => { if (t().matches(':focus-visible, :has(:focus-visible)')) show() }],
    [t(), 'focusout', hide],
    [t(), 'pointerdown', (e: PointerEvent) => {
      hide()
      if (e.pointerType !== 'touch') return
      later(() => { show(); later(hide, 1500) }, 500)
    }],
    [t(), 'pointerup', (e: PointerEvent) => { if (e.pointerType === 'touch' && !open()) clearTimeout(timer) }],
    [t(), 'pointercancel', () => clearTimeout(timer)],
  ]
  for (const [target, type, fn] of on) target.addEventListener(type, fn)
  return {
    update: (next: typeof opts) => void (o = next),
    destroy() {
      for (const [target, type, fn] of on) target.removeEventListener(type, fn)
      hide()
    },
  }
}
