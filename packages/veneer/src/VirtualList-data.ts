// Per-instance keys, rows and probe samples for a virtual list.
import { derived, state, untrack } from '@kerf-js/core'
import type { VirtualKey } from '@kerf-js/veneer-core'
import type { VirtualListProps } from './VirtualList-types'

/** Create the list's reactive data without changing its owner. */
export function virtualData<T>(read: () => VirtualListProps<T>) {
  const props = untrack(read)
  const items = derived(() => props.items)
  const keyOf = (item: T) => props.rowKey(item)
  const keys = derived(() => items.value.map(keyOf))
  const variantOf = (item: T) => props.variant?.(item) ?? ''
  const first = untrack(() => {
    const n = items.value.length,
      count = Math.min(n, props.initial ?? 20)
    return Array.from({ length: count }, (_, i) => (props.from === 'end' ? n - count + i : i))
  })
  // Keys, not indices: a prepend renumbers every row, and that mustn't look like a new set of rows.
  const shown = state<VirtualKey[]>(untrack(() => first.map((i) => keyOf(items.value[i]!))))
  const index = derived(() => new Map(keys.value.map((k, i) => [k, i])))
  const rows = derived(() => {
    const all = items.value,
      at = index.value
    return shown.value.flatMap((key) => {
      const i = at.get(key)
      return i === undefined ? [] : [{ item: all[i]!, i, key }]
    })
  })

  const samples = derived(() => {
    if (!props.text) return []
    const seen = new Map<string, T>()
    for (const item of items.value) {
      const name = variantOf(item)
      if (!seen.has(name)) seen.set(name, item)
      if (!props.variant) break
    }
    return [...seen]
  })
  const probing = state(false)

  return { items, keyOf, keys, variantOf, shown, index, rows, samples, probing }
}
