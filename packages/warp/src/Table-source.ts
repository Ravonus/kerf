// Filtering, ordering and paging of table rows.
import { derived, type Resource, type State } from '@weft-js/core'
import { filterRows, pageSlice, sortRows } from '@weft-js/warp-core'
import type { Column, ListPage, TableProps, TableSort, TableStatus } from './Table-types'

const isResource = (r: unknown): r is Resource<unknown> =>
  typeof (r as Resource<unknown> | null | undefined)?.refresh === 'function'
const isState = (r: object | null | undefined): r is State<unknown> =>
  r != null && !Array.isArray(r) && 'value' in r

/** Create the table's derived row and status views. */
export function tableSource<T>(
  rows: () => TableProps<T>['rows'],
  server: () => boolean | undefined,
  page: () => TableProps<T>['page'],
  status: () => TableStatus | undefined,
  cols: { readonly value: Column<T>[] },
  typed: State<string>,
  order: State<TableSort | undefined>,
  at: State<number>,
  read: (column: Column<T>, row: T) => unknown,
) {
  const source = () =>
    (isResource(rows())
      ? (rows() as Resource<unknown>).value
      : isState(rows())
        ? (rows() as State<unknown>).value
        : rows()) as readonly T[] | ListPage<T> | undefined
  const remote = derived(() => !!server() || isResource(rows()))
  const list = derived<readonly T[]>(() => {
    const v = source()
    return Array.isArray(v) ? (v as readonly T[]) : ((v as ListPage<T> | undefined)?.items ?? [])
  })
  const envelope = derived<ListPage<T> | undefined>(() => {
    const v = source()
    return v && !Array.isArray(v) ? (v as ListPage<T>) : undefined
  })
  const shown = derived(() => {
    if (remote.value) return list.value
    const c = cols.value
    const found = filterRows(list.value, typed.value, (r) => c.map((x) => read(x, r)))
    const s = order.value
    const by = s && c.find((x) => x.id === s.id)
    if (!s || !by) return found
    return sortRows(found, typeof by.sort === 'function' ? by.sort : (r) => read(by, r), s.dir)
  })
  const paged = derived(() => {
    const size = page()?.size
    return size && !remote.value ? pageSlice(shown.value, at.value, size) : undefined
  })
  const visible = derived(() => paged.value?.rows ?? shown.value)
  const phase = derived<TableStatus>(() => {
    if (status()) return status()!
    const r = rows()
    if (isResource(r)) {
      if (r.error) return 'error'
      if (r.value === undefined) return 'loading'
    }
    return visible.value.length ? 'ready' : 'empty'
  })
  return { remote, list, envelope, shown, paged, visible, phase }
}
