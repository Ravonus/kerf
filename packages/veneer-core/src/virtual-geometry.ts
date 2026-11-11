import type { VirtualKey } from './virtual'
import type { VirtualState } from './virtual-state'

const FALLBACK_VIEWPORT = 600 // nothing is laid out yet: render about a screen

export function virtualGeometry(v: VirtualState) {
  const gap = () => v.o.gap ?? 0
  const estimate = (i: number) =>
    typeof v.o.estimate === 'function' ? v.o.estimate(i) : v.o.estimate
  // The browser rounds scrollTop, so a run of small corrections read from it would drift by the rounding of each.

  const position = () => {
    const real = (v.horizontal ? Math.abs(v.el.scrollLeft) : v.el.scrollTop) - v.lead
    return Math.abs(real - v.exact) < 1 ? v.exact : real
  }
  const move = (to: number) => {
    const next = Math.max(0, to + v.lead)
    v.exact = next - v.lead
    if (v.horizontal) v.el.scrollLeft = next
    else v.el.scrollTop = next
  }
  const head = () => v.o.head ?? 0
  const room = () => (v.viewport || FALLBACK_VIEWPORT) - head()
  const sizeFor = (i: number) => {
    const seen = v.known.get(v.keys[i]!)
    if (seen && seen.cross === v.cross) return seen.size + gap()
    return (v.o.size?.(i, v.cross) ?? seen?.size ?? estimate(i)) + gap()
  }

  function bounds() {
    if (v.horizontal) v.o.spacer.style.inlineSize = `${v.sizes.total + head()}px`
    else v.o.spacer.style.blockSize = `${Math.max(0, v.sizes.total - gap()) + head()}px`
  }

  function place(key: VirtualKey) {
    const row = v.rows.get(key),
      i = v.index.get(key)
    if (!row || i === undefined) return
    const at = v.sizes.offset(i) + head()
    if (at !== row.at) {
      row.at = at
      // A vertical row moves by its inset, not a transform: a view() timeline in it (veneer's flow) reads its laid-out
      // place, and every translated row would sit at the top of the window, past its exit.
      if (v.horizontal) row.el.style.transform = `translateX(${at}px)`
      else row.el.style.insetBlockStart = `${at}px`
    }
    if (!v.o.sized) return
    const size = v.sizes.get(i)! - gap()
    if (size === row.size) return
    row.size = size
    if (v.horizontal) row.el.style.inlineSize = `${size}px`
    else row.el.style.blockSize = `${size}px`
  }

  return { gap, position, move, head, room, sizeFor, bounds, place }
}
