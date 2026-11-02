// The dismiss-layer stack (05 §3 "layer rules", components.html:1395-1407). Every open overlay pushes a layer: Escape
// closes the top one; an outside press closes non-modal layers above the press; passive layers (tooltips) close on
// Escape but never eat a press. Placement (05 §3): anchored to a trigger, flips when there is no room, clamped 8px.

/** One open layer on the stack. */
export interface Layer {
  el: HTMLElement
  close(reason: 'escape' | 'outside'): void
  /** The element that opened it: a press on it is not "outside". */
  trigger?: Element | null | undefined
  /** Modal layers (dialogs) handle their own outside press (backdrop). */
  modal?: boolean
  /** Tooltips: closed by Escape, ignored by presses. */
  passive?: boolean
  /** The layer's own use of Escape before it closes (clear a query, go up a level): true when it used the key. */
  escape?(): boolean
}

const stacks = new WeakMap<Document, Layer[]>()
let escapedAt = 0

/** True for ~80ms after the stack handled an Escape, so a dialog's own `cancel` doesn't close a second layer. */
export const justEscaped = () => performance.now() - escapedAt < 80

function stackOf(doc: Document) {
  let stack = stacks.get(doc)
  if (stack) return stack
  stacks.set(doc, (stack = []))
  doc.addEventListener('keydown', e => {
    if (e.key !== 'Escape' || !stack.length) return
    const top = stack.at(-1)!
    e.preventDefault()
    escapedAt = performance.now()
    if (!top.escape?.()) top.close('escape')
  }, true)
  doc.addEventListener('pointerdown', e => {
    const t = e.target as Node
    for (let i = stack.length - 1; i >= 0; i--) {
      const l = stack[i]!
      if (l.passive) continue
      if (l.modal || l.el.contains(t) || l.trigger?.contains(t)) break
      l.close('outside')
    }
  }, true)
  return stack
}

const modalWatchers = new WeakMap<Document, Set<(top: HTMLElement | null) => void>>()

/** Hear which modal is on top, now and each time that changes (null: none); the returned function stops listening. */
export function onTopModal(doc: Document, fn: (top: HTMLElement | null) => void) {
  let set = modalWatchers.get(doc)
  if (!set) modalWatchers.set(doc, (set = new Set()))
  set.add(fn)
  const top = stackOf(doc).findLast(l => l.modal)?.el
  if (top) fn(top)
  return () => void set.delete(fn)
}

/** Push a layer; the returned function removes it (call it when the overlay closes, whatever closed it). */
export function pushLayer(layer: Layer) {
  const doc = layer.el.ownerDocument
  const stack = stackOf(doc)
  const told = () => { if (layer.modal) for (const fn of modalWatchers.get(doc) ?? []) fn(stack.findLast(l => l.modal)?.el ?? null) }
  stack.push(layer)
  told()
  return () => {
    const i = stack.indexOf(layer)
    if (i < 0) return
    stack.splice(i, 1)
    told()
  }
}

/** The side of its anchor a floating element opens on. */
export type Side = 'top' | 'bottom' | 'left' | 'right'
/** How a floating element lines up along its anchor. */
export type Align = 'start' | 'center' | 'end'

/**
 * place(layer, trigger, side, align, gap) from the specimens: position a top-layer element (fixed) by its trigger,
 * flip to the opposite side when there is no room, clamp 8px inside the viewport, write data-side. `side` is physical;
 * along the inline axis `align` is logical, so start is the trigger's right edge in RTL.
 */
export function place(el: HTMLElement, trigger: Element, side: Side = 'bottom', align: Align = 'start', gap = 8) {
  const win = el.ownerDocument.defaultView!
  const t = trigger.getBoundingClientRect()
  // the laid-out size: a panel opening is still scaled down, and a rect would measure that
  const r = el.getBoundingClientRect()
  const w = el.offsetWidth || r.width, h = el.offsetHeight || r.height
  const vw = win.innerWidth, vh = win.innerHeight
  const room = { top: t.top, bottom: vh - t.bottom, left: t.left, right: vw - t.right }
  const size = side === 'top' || side === 'bottom' ? h : w
  const flip = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const
  if (room[side] < size + gap && room[flip[side]] > room[side]) side = flip[side]
  let x: number, y: number
  if (side === 'top' || side === 'bottom') {
    y = side === 'top' ? t.top - gap - h : t.bottom + gap
    const rtl = win.getComputedStyle(trigger).direction === 'rtl'
    x = align === 'center' ? t.left + (t.width - w) / 2 : (align === 'start') !== rtl ? t.left : t.right - w
  } else {
    x = side === 'left' ? t.left - gap - w : t.right + gap
    y = align === 'start' ? t.top : align === 'end' ? t.bottom - h : t.top + (t.height - h) / 2
  }
  const left = Math.round(Math.max(8, Math.min(x, vw - w - 8)))
  const top = Math.round(Math.max(8, Math.min(y, vh - h - 8)))
  el.style.left = `${left}px`
  el.style.top = `${top}px`
  // it scales about the trigger, so it visibly comes from what opened it
  const ox = side === 'left' ? w : side === 'right' ? 0 : Math.max(0, Math.min(w, t.left + t.width / 2 - left))
  const oy = side === 'top' ? h : side === 'bottom' ? 0 : Math.max(0, Math.min(h, t.top + t.height / 2 - top))
  el.style.setProperty('--warp-origin', `${Math.round(ox)}px ${Math.round(oy)}px`)
  el.dataset.side = side
}
