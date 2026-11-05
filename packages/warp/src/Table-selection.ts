// Selection and sorting state for a table.
import { derived, type State } from '@weft-js/core'
import { checkState, rangeOf, type SortDir } from '@weft-js/warp-core'
import type { Column, TableProps, TableSort } from './Table-types'

/** Create selection and sort callbacks under the table's owner. */
export function tableSelection<T>(
  sel: State<Record<string, boolean>> | undefined,
  visible: { readonly value: readonly T[] },
  keyOf: (row: T) => string,
  cols: { readonly value: Column<T>[] },
  order: State<TableSort | undefined>,
  props: TableProps<T>,
) {
  let anchor: string | undefined
  const keys = derived(() => visible.value.map(keyOf))
  const chosen = () => Object.keys(sel!.value).filter((k) => sel!.value[k])
  const write = (next: Record<string, boolean>) => {
    sel!.value = next
    props.onSelectionChange?.(Object.keys(next).filter((k) => next[k]))
  }
  const pick = (key: string, e: MouseEvent) => {
    const next = { ...sel!.value }
    if (e.shiftKey && anchor !== undefined)
      for (const k of rangeOf(keys.value, anchor, key)) next[k] = true
    else if (next[key]) delete next[key]
    else next[key] = true
    anchor = key
    write(next)
  }
  const headerCheck = derived(() =>
    sel ? checkState(keys.value, (k) => !!(sel.get(k) as boolean | undefined)) : 'none',
  )
  const pickAll = () => {
    const next = { ...sel!.value }
    const off = headerCheck.value === 'all'
    for (const k of keys.value) {
      if (off) delete next[k]
      else next[k] = true
    }
    write(next)
  }

  const askSort = (c: Column<T>, dir?: SortDir) => {
    const now = order.value
    const next = {
      id: c.id,
      dir: dir ?? (now?.id === c.id && now.dir === 'ascending' ? 'descending' : 'ascending'),
    }
    order.value = next
    props.onSortChange?.(next)
  }
  const sortable = derived(() => cols.value.filter((c) => c.sort))

  return { keys, chosen, write, pick, headerCheck, pickAll, askSort, sortChoices: sortable }
}
