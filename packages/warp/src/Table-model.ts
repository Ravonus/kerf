// Assemble the table's per-instance state and lifecycle.
import { derived, onCleanup, watch } from '@weft-js/core'
import { table } from '@weft-js/warp-core'
import { use } from '@weft-js/warp-core/weft'
import { tableBase } from './Table-base'
import { tableDetails } from './Table-details'
import { tableSelection } from './Table-selection'
import { tableSource } from './Table-source'
import { tablePaging } from './Table-paging'
import { tableNotice } from './Table-notice'
import type { Column, TableProps } from './Table-types'

/** Live access to the caller's table props. */
export type TableInput<T> = { [K in keyof TableProps<T>]-?: () => TableProps<T>[K] }
type Refs = { el: HTMLDivElement | undefined; columnsButton: HTMLElement | undefined }

function tableCore<T>(input: TableInput<T>, refs: Refs) {
  const base = tableBase({
    heading: () => input.heading()!,
    columns: input.columns,
    rowKey: () => input.rowKey()!,
    query: input.query,
    sort: input.sort,
    selection: input.selection,
    hiddenColumns: input.hiddenColumns,
    phone: () => input.phone()!,
  })
  const { id, level, cols, keyOf, read, title, typed, order, sel, open, at, sheet } = base
  const source = tableSource(
    input.rows,
    input.server,
    input.page,
    input.status,
    cols,
    typed,
    order,
    at,
    read,
  )
  watch(
    () => typed.value,
    (_, was) => {
      if (was !== undefined) at.value = 0
    },
  )
  const selection = tableSelection(
    sel,
    source.visible,
    keyOf,
    cols,
    order,
    input.onSelectionChange,
    input.onSortChange,
  )
  const details = tableDetails({
    id,
    level,
    cols,
    keyOf,
    read,
    sel,
    open,
    title,
    pick: selection.pick,
    sheet,
    columns: input.columns,
    expand: input.expand,
    details: input.details,
    onEdit: input.onEdit,
    element: () => refs.el,
  })
  return { base, source, selection, details }
}

/** Create the table model under its existing owner. */
export function tableModel<T>(input: TableInput<T>) {
  const refs: Refs = { el: undefined, columnsButton: undefined }
  const { base, source, selection, details } = tableCore(input, refs)
  const { cols, typed, hidden, at, sheet, width } = base
  const paging = tablePaging(input.rows, input.page, input.onPageChange, source, at)
  const notice = tableNotice(
    input.rows,
    input.error,
    input.empty,
    input.onRetry,
    source.phase,
    typed,
  )
  use(
    table,
    () => refs.el,
    () => ({ hidden: hidden.value, rows: source.visible.value, onWidth: (w) => (width.value = w) }),
  )
  onCleanup(() => (sheet.value = undefined))
  const toolbar = derived(
    () =>
      input.filter() !== undefined ||
      input.actions() !== undefined ||
      !!(input.picker() as unknown),
  )
  const hideable = derived(() => cols.value.filter((c) => !c.pin))
  const flip = (c: Column<T>, show: boolean) => {
    hidden.value = show ? hidden.value.filter((x) => x !== c.id) : [...hidden.value, c.id]
  }
  return { input, refs, base, source, selection, details, paging, notice, toolbar, hideable, flip }
}
