// The dismiss-layer stack (05 §3 "layer rules", components.html:1395-1407). Every open overlay pushes a layer: Escape
// closes the top one; an outside press closes non-modal layers above the press; passive layers (tooltips) close on
// Escape but never eat a press. Placement (05 §3): anchored to a trigger, flips when there is no room, clamped 8px.

export interface Layer {
  el: HTMLElement
  close(reason: 'escape' | 'outside'): void
  /** The element that opened it: a press on it is not "outside". */
  trigger?: Element | null
  /** Modal layers (dialogs) handle their own outside press (backdrop). */
  modal?: boolean
  /** Tooltips: closed by Escape, ignored by presses. */
  passive?: boolean
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
    if (e.key !== 'Escape' || !stack!.length) return
    const top = stack!.at(-1)!
    e.preventDefault()
    escapedAt = performance.now()
    top.close('escape')
  }, true)
  doc.addEventListener('pointerdown', e => {
    const t = e.target as Node
    for (let i = stack!.length - 1; i >= 0; i--) {
      const l = stack![i]
      if (l.passive) continue
      if (l.modal || l.el.contains(t) || l.trigger?.contains(t)) break
      l.close('outside')
    }
  }, true)
  return stack
}

/** Push a layer; the returned function removes it (call it when the overlay closes, whatever closed it). */
export function pushLayer(layer: Layer) {
  const stack = stackOf(layer.el.ownerDocument)
  stack.push(layer)
  return () => {
    const i = stack.indexOf(layer)
    if (i >= 0) stack.splice(i, 1)
  }
}

export type Side = 'top' | 'bottom' | 'left' | 'right'
export type Align = 'start' | 'center' | 'end'

/**
 * place(layer, trigger, side, align, gap) from the specimens: position a top-layer element (fixed) by its trigger,
 * flip to the opposite side when there is no room, clamp 8px inside the viewport, write data-side.
 */
export function place(el: HTMLElement, trigger: Element, side: Side = 'bottom', align: Align = 'start', gap = 8) {
  const win = el.ownerDocument.defaultView!
  const t = trigger.getBoundingClientRect()
  const r = el.getBoundingClientRect()
  const vw = win.innerWidth, vh = win.innerHeight
  const room = { top: t.top, bottom: vh - t.bottom, left: t.left, right: vw - t.right }
  const size = side === 'top' || side === 'bottom' ? r.height : r.width
  const flip = { top: 'bottom', bottom: 'top', left: 'right', right: 'left' } as const
  if (room[side] < size + gap && room[flip[side]] > room[side]) side = flip[side]
  let x: number, y: number
  if (side === 'top' || side === 'bottom') {
    y = side === 'top' ? t.top - gap - r.height : t.bottom + gap
    x = align === 'start' ? t.left : align === 'end' ? t.right - r.width : t.left + (t.width - r.width) / 2
  } else {
    x = side === 'left' ? t.left - gap - r.width : t.right + gap
    y = align === 'start' ? t.top : align === 'end' ? t.bottom - r.height : t.top + (t.height - r.height) / 2
  }
  el.style.left = `${Math.round(Math.max(8, Math.min(x, vw - r.width - 8)))}px`
  el.style.top = `${Math.round(Math.max(8, Math.min(y, vh - r.height - 8)))}px`
  el.dataset.side = side
}
