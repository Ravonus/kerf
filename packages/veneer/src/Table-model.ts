// Assemble the table's per-instance state and lifecycle.
import { derived, onCleanup, watch } from '@kerf/core'
import { table } from '@kerf/veneer-core'
import { use } from '@kerf/veneer-core/kerf'
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
export type TableRender = <T>(model: TableModel<T>) => unknown

/** Create private state and render it under the table's existing owner. */
export function tableModel<T>(input: TableInput<T>, render: TableRender) {
  const refs: Refs = { el: undefined, columnsButton: undefined }
  const base = tableBase(input)
  const [, , cols, keyOf, read, , typed, order, sel, , hidden, at, sheet, , , width] = base
  const source = tableSource({ props: input, cols, typed, order, at, read })
  const [, , , , , visible, phase] = source
  watch(
    () => typed.value,
    (_, was) => {
      if (was !== undefined) at.value = 0
    },
  )
  const selection = tableSelection({ sel, visible, keyOf, cols, order, props: input })
  const [, , , pick] = selection
  const details = tableDetails({ props: input, base, pick, element: () => refs.el })
  const paging = tablePaging(input, source, at)
  const notice = tableNotice(input, phase, typed)
  use(
    table,
    () => refs.el,
    () => ({ hidden: hidden.value, rows: visible.value, onWidth: (w) => (width.value = w) }),
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
  return render({
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
  })
}
