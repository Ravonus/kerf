import type { Virtualizer } from './virtual'
import type { VirtualState } from './virtual-state'
import type { virtualGeometry } from './virtual-geometry'
import type { virtualRange } from './virtual-range'
import { virtualRekey } from './virtual-rekey'

export function virtualApi(
  v: VirtualState,
  g: ReturnType<typeof virtualGeometry>,
  r: ReturnType<typeof virtualRange>,
  watched: ResizeObserver | null,
  box: ResizeObserver | null,
) {
  const { sizeFor, place, move, room, gap, position } = g
  const { range, anchored, onScroll, end } = r
  const api: Virtualizer = {
    sizes: v.sizes,
    get stuck() {
      return v.stuck
    },
    update(next) {
      const before = v.o.keys
      Object.assign(v.o, next)
      if (next.keys && next.keys !== before) virtualRekey(v, g, r, next.keys)
      else range()
    },
    refresh(from = 0, to = v.keys.length) {
      anchored(() => {
        for (let i = from; i < Math.min(to, v.keys.length); i++) v.sizes.set(i, sizeFor(i))
      })
    },
    attach(row, key) {
      v.keyOf.set(row, key)
      v.rows.set(key, { el: row, at: -1, size: -1 })
      place(key)
      if (!v.o.sized) watched?.observe(row)
      return () => {
        watched?.unobserve(row)
        if (v.rows.get(key)?.el === row) v.rows.delete(key)
      }
    },
    scrollTo(i, align = 'start') {
      const at = v.sizes.offset(i),
        size = v.sizes.get(i) ?? 0
      move(
        align === 'start'
          ? at
          : align === 'center'
            ? at - (room() - size) / 2
            : at + size - gap() - room(),
      )
      onScroll()
    },
    scrollToEnd() {
      end()
      onScroll()
    },
    anchor() {
      const top = position(),
        at = v.sizes.at(top)
      return { index: at, within: top - v.sizes.offset(at) }
    },
    destroy() {
      v.el.removeEventListener('scroll', onScroll)
      watched?.disconnect()
      box?.disconnect()
    },
  }

  return api
}
