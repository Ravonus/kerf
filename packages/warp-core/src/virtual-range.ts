import type { VirtualState } from './virtual-state'
import type { virtualGeometry } from './virtual-geometry'

export function virtualRange(v: VirtualState, g: ReturnType<typeof virtualGeometry>) {
  const { gap, position, move, room, bounds, place } = g
  function range() {
    const n = v.keys.length
    if (!n) return emit([])
    const over = v.o.overscan ?? Math.max(room(), 200),
      top = position()
    const start = v.sizes.at(top - over),
      end = Math.min(n - 1, v.sizes.at(top + room() + over))
    const out: number[] = []
    for (let i = start; i <= end; i++) out.push(i)
    for (const key of v.o.pinned?.() ?? []) {
      const i = v.index.get(key)
      if (i !== undefined && (i < start || i > end)) out.push(i)
    }
    emit(out.sort((a, b) => a - b))
  }

  function emit(next: number[]) {
    if (!v.renamed && next.length === v.last.length && next.every((n, i) => n === v.last[i])) return
    v.renamed = false
    v.last = next
    v.o.onRange(next)
  }

  function setStuck(next: boolean) {
    if (next === v.stuck) return
    v.stuck = next
    v.o.onStick?.(next)
  }

  const end = () => move(v.sizes.total - gap() - room() + v.trail)

  /** Run a change to the sizes; the row at the top of the viewport doesn't move on screen. */
  function anchored(change: () => void) {
    const before = position(),
      at = v.sizes.at(before),
      from = v.sizes.offset(at)
    change()
    bounds()
    for (const key of v.rows.keys()) place(key)
    if (v.o.stick != null && v.stuck) end()
    else {
      const moved = v.sizes.offset(at) - from
      if (moved) move(before + moved)
    }
    range()
  }

  function onScroll() {
    if (v.o.stick != null) setStuck(v.sizes.total - gap() - room() - position() <= v.o.stick)
    range()
    v.o.onScroll?.(position())
  }

  return { range, setStuck, end, anchored, onScroll }
}
