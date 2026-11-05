import type { VirtualKey, Virtualizer } from './virtual'
import type { VirtualState } from './virtual-state'
import type { virtualGeometry } from './virtual-geometry'
import type { virtualRange } from './virtual-range'

export function virtualObservers(
  v: VirtualState,
  g: ReturnType<typeof virtualGeometry>,
  r: ReturnType<typeof virtualRange>,
  getApi: () => Virtualizer,
) {
  const { gap } = g
  const { anchored, end, range } = r
  const rowBox = (e: ResizeObserverEntry) => {
    const box = e.borderBoxSize?.[0]
    return box
      ? v.horizontal
        ? box.inlineSize
        : box.blockSize
      : v.horizontal
        ? (e.target as HTMLElement).offsetWidth
        : (e.target as HTMLElement).offsetHeight
  }

  const watched =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver((entries) => {
          if (measure()) getApi().refresh() // rows report a new width before the box does: these sizes belong to it
          const changed: [number, VirtualKey, number][] = []
          for (const e of entries) {
            const key = v.keyOf.get(e.target),
              i = key === undefined ? undefined : v.index.get(key)
            if (key === undefined || i === undefined) continue
            const size = rowBox(e)
            if (!size) continue // display: none, or a detached row
            v.known.set(key, { size, cross: v.cross })
            if (Math.abs(size + gap() - v.sizes.get(i)!) > 0.01) changed.push([i, key, size])
          }
          if (!changed.length) return
          anchored(() => {
            for (const [i, , size] of changed) {
              v.o.onDrift?.(i, v.sizes.get(i)! - gap(), size)
              v.sizes.set(i, size + gap())
            }
          })
        })
      : null

  const measure = () => {
    const c = getComputedStyle(v.el)
    const pad = parseFloat(v.horizontal ? c.paddingInlineStart : c.paddingBlockStart) || 0
    v.trail = parseFloat(v.horizontal ? c.paddingInlineEnd : c.paddingBlockEnd) || 0
    v.lead =
      v.o.spacer.offsetParent === v.el
        ? v.horizontal
          ? v.o.spacer.offsetLeft
          : v.o.spacer.offsetTop
        : pad
    const box = v.el.getBoundingClientRect()
    const next = {
      viewport: v.horizontal ? v.el.clientWidth : v.el.clientHeight,
      cross:
        v.o.spacer.getBoundingClientRect()[v.horizontal ? 'height' : 'width'] ||
        (v.horizontal ? box.height : box.width),
    }
    const moved = next.cross !== v.cross
    v.viewport = next.viewport
    v.cross = next.cross
    return moved
  }

  const box =
    typeof ResizeObserver === 'function'
      ? new ResizeObserver(() => {
          if (measure()) getApi().refresh()
          else {
            if (v.o.stick != null && v.stuck) end()
            range()
          }
        })
      : null

  return { watched, measure, box }
}
