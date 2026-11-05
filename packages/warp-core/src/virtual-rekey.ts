import type { VirtualKey } from './virtual'
import type { VirtualState } from './virtual-state'
import type { virtualGeometry } from './virtual-geometry'
import type { virtualRange } from './virtual-range'

export function virtualRekey(
  v: VirtualState,
  g: ReturnType<typeof virtualGeometry>,
  r: ReturnType<typeof virtualRange>,
  next: readonly VirtualKey[],
) {
  const { sizeFor, bounds, position, place, move } = g
  const { end, range } = r
  const old = v.keys
  if (next === old) return
  const shared = Math.min(old.length, next.length)
  let same = 0
  while (same < shared && old[same] === next[same]) same++
  v.keys = next
  if (same === old.length) {
    // the common case, a growing list: nothing above moves
    for (let i = same; i < next.length; i++) {
      v.index.set(next[i]!, i)
      v.sizes.push(sizeFor(i))
    }
    bounds()
    if (v.o.stick != null && v.stuck) end()
    range()
    return
  }
  const at = position(),
    held = v.sizes.at(at),
    key = old[held]!,
    within = at - v.sizes.offset(held)
  v.renamed = true
  v.index = new Map(next.map((k, i) => [k, i]))
  v.sizes.fill(next.map((_, i) => sizeFor(i)))
  for (const k of v.known.keys()) if (!v.index.has(k)) v.known.delete(k)
  bounds()
  for (const k of v.rows.keys()) place(k)
  const found = v.index.get(key)
  if (v.o.stick != null && v.stuck) end()
  else if (found !== undefined) move(v.sizes.offset(found) + within)
  range()
}
