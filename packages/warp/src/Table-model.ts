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
export type TableInput<T> = TableProps<T>
type Refs = { el: HTMLDivElement | undefined; columnsButton: HTMLElement | undefined }

/** The table's private state, shared by its concern helpers. */
export type TableModel<T> = {
  input: TableInput<T>
  refs: Refs
  base: ReturnType<typeof tableBase<T>>
  source: ReturnType<typeof tableSource<T>>
  selection: ReturnType<typeof tableSelection<T>>
  details: ReturnType<typeof tableDetails<T>>
  paging: ReturnType<typeof tablePaging<T>>
  notice: ReturnType<typeof tableNotice<T>>
  toolbar: { readonly value: boolean }
  hideable: { readonly value: Column<T>[] }
  flip: (column: Column<T>, show: boolean) => void
}

/** Render directly from private state instead of packing a second controller record. */
export type TableRender = <T>(
  input: TableModel<T>['input'],
  refs: TableModel<T>['refs'],
  base: TableModel<T>['base'],
  source: TableModel<T>['source'],
  selection: TableModel<T>['selection'],
  details: TableModel<T>['details'],
  paging: TableModel<T>['paging'],
  notice: TableModel<T>['notice'],
  toolbar: TableModel<T>['toolbar'],
  hideable: TableModel<T>['hideable'],
  flip: TableModel<T>['flip'],
) => unknown

/** Create private state and render it under the table's existing owner. */
export function tableModel<T>(input: TableInput<T>, render: TableRender) {
  const refs: Refs = { el: undefined, columnsButton: undefined }
  const base = tableBase(input)
  const { cols, keyOf, read, typed, order, sel, at } = base
  const source = tableSource(input, cols, typed, order, at, read)
  watch(
    () => typed.value,
    (_, was) => {
      if (was !== undefined) at.value = 0
    },
  )
  const selection = tableSelection(sel, source.visible, keyOf, cols, order, input)
  const details = tableDetails(input, base, selection.pick, () => refs.el)
  const { hidden, sheet, width } = base
  const paging = tablePaging(input, source, at)
  const notice = tableNotice(input, source.phase, typed)
  use(
    table,
    () => refs.el,
    () => ({ hidden: hidden.value, rows: source.visible.value, onWidth: (w) => (width.value = w) }),
  )
  onCleanup(() => (sheet.value = undefined))
  const toolbar = derived(
    () =>
      input.filter !== undefined ||
      input.actions !== undefined ||
      !!((input.picker === undefined ? true : input.picker) as unknown),
  )
  const hideable = derived(() => cols.value.filter((c) => !c.pin))
  const flip = (c: Column<T>, show: boolean) => {
    hidden.value = show ? hidden.value.filter((x) => x !== c.id) : [...hidden.value, c.id]
  }
  return render(
    input,
    refs,
    base,
    source,
    selection,
    details,
    paging,
    notice,
    toolbar,
    hideable,
    flip,
  )
}
