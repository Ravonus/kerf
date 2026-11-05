// The table's row details and editing context.
import { untrack, type State } from '@weft-js/core'
import { Fields } from './Table-rows'
import type { Column, Ctx, TableProps } from './Table-types'

type DetailInput<T> = {
  id: string
  level: number
  cols: { readonly value: Column<T>[] }
  keyOf: (row: T) => string
  read: (column: Column<T>, row: T) => unknown
  sel: State<Record<string, boolean>> | undefined
  open: State<Record<string, boolean>>
  title: (row: T) => string
  pick: (key: string, event: MouseEvent) => void
  sheet: State<{ row: T; from: HTMLElement } | undefined>
  columns: () => Column<T>[]
  props: TableProps<T>
  details: () => TableProps<T>['details']
  element: () => HTMLElement | undefined
}

/** Create details callbacks and the context shared by rows. */
export function tableDetails<T>(input: DetailInput<T>) {
  const {
    id,
    level,
    cols,
    keyOf,
    read,
    sel,
    open,
    title,
    pick,
    sheet,
    columns,
    props,
    details,
    element,
  } = input
  const hasDetails = untrack(() => props.expand !== undefined || columns().some((c) => c.priority))
  const toggle = (row: T, from: HTMLElement) => {
    if (details() === 'sheet' && (element()?.clientWidth ?? 1000) < 1000) {
      sheet.value = { row, from }
      return
    }
    const k = keyOf(row)
    const next = { ...open.value }
    if (next[k]) delete next[k]
    else next[k] = true
    open.value = next
  }
  const closeSheet = (restore?: boolean) => {
    const from = sheet.value?.from
    sheet.value = undefined
    if (restore) from?.focus()
  }

  const ctx: Ctx<T> = {
    id,
    level,
    cols: () => cols.value,
    keyOf,
    read,
    sel,
    open,
    details: hasDetails,
    title,
    pick,
    toggle,
    span: () => cols.value.length + (sel ? 1 : 0) + (hasDetails ? 1 : 0),
    body: (row) => (props.expand ? props.expand(row) : <Fields row={row} ctx={ctx} />),
    edit: (r, c, v) => props.onEdit?.(r, c, v),
  }

  return { ctx, hasDetails, closeSheet }
}
