// Autoscroll: holding a text selection past the edge, or dragging something over the edge, scrolls toward it, faster
// the further out the pointer is. The selection follows the content as it moves, as it does natively.
import type { Engine } from './engine'
import type { Axis } from './types'

/** px per ms for a pointer `out` px past an edge. */
export const autoSpeed = (out: number) =>
  out ? Math.sign(out) * Math.min(4, Math.max(0.15, Math.abs(out) / 25)) : 0

/** How far `p` is outside `[lo, hi]`, signed. */
const outside = (p: number, lo: number, hi: number) => (p < lo ? p - lo : p > hi ? p - hi : 0)

type CaretDoc = Document & {
  caretPositionFromPoint?: (x: number, y: number) => { offsetNode: Node; offset: number } | null
  caretRangeFromPoint?: (x: number, y: number) => Range | null
}

/** The caret under a point: Chrome and Firefox have the standard call, Safari the older one. */
function caretAt(x: number, y: number) {
  const doc = document as CaretDoc
  const pos = doc.caretPositionFromPoint?.(x, y)
  if (pos) return pos
  const r = doc.caretRangeFromPoint?.(x, y)
  return r ? { offsetNode: r.startContainer, offset: r.startOffset } : null
}

/** Listen for held selections and drags over the viewport. Returns the cleanup. */
export function autoscroll(e: Engine) {
  let point: { x: number; y: number } | null = null
  const set = (axis: Axis, v: number) => e.auto(axis, e.o.autoscroll ? v : 0)
  const halt = () => {
    point = null
    set('x', 0)
    set('y', 0)
  }
  e.afterAuto = () => {
    if (!point) return
    const r = e.vp.getBoundingClientRect()
    const x = Math.min(r.right - 2, Math.max(r.left + 2, point.x))
    const y = Math.min(r.bottom - 2, Math.max(r.top + 2, point.y))
    const sel = getSelection()
    const at = caretAt(x, y)
    if (sel && at && sel.rangeCount && e.vp.contains(at.offsetNode))
      sel.extend(at.offsetNode, at.offset)
  }

  const move = (ev: PointerEvent) => {
    if (!(ev.buttons & 1)) return up()
    const sel = getSelection()
    if (!sel || sel.isCollapsed) return (set('x', 0), set('y', 0))
    const r = e.vp.getBoundingClientRect()
    point = { x: ev.clientX, y: ev.clientY }
    set('x', autoSpeed(outside(ev.clientX, r.left, r.right)))
    set('y', autoSpeed(outside(ev.clientY, r.top, r.bottom)))
  }
  const up = () => {
    halt()
    removeEventListener('pointermove', move)
    removeEventListener('pointerup', up)
  }
  const down = (ev: PointerEvent) => {
    if (ev.pointerType !== 'mouse' || ev.button !== 0 || e.o.grab) return
    addEventListener('pointermove', move)
    addEventListener('pointerup', up)
  }

  let dragTimer: ReturnType<typeof setTimeout> | undefined
  const over = (ev: DragEvent) => {
    const r = e.vp.getBoundingClientRect()
    const band = Math.min(40, r.height / 4, r.width / 4)
    const edge = (p: number, lo: number, hi: number) =>
      p < lo + band ? p - lo - band : p > hi - band ? p - hi + band : 0
    point = null
    set('x', autoSpeed(edge(ev.clientX, r.left, r.right)))
    set('y', autoSpeed(edge(ev.clientY, r.top, r.bottom)))
    clearTimeout(dragTimer)
    dragTimer = setTimeout(halt, 150)
  }

  e.vp.addEventListener('pointerdown', down)
  e.vp.addEventListener('dragover', over)
  e.vp.addEventListener('drop', halt)
  return () => {
    clearTimeout(dragTimer)
    up()
    e.afterAuto = null
    e.vp.removeEventListener('pointerdown', down)
    e.vp.removeEventListener('dragover', over)
    e.vp.removeEventListener('drop', halt)
  }
}
