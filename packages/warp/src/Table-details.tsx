// The table's row details and editing context.
import { untrack } from '@weft-js/core'
import { Fields } from './Table-rows'
import type { tableBase } from './Table-base'
import type { Ctx, TableProps } from './Table-types'

/** Create details callbacks and the context shared by rows. */
export function tableDetails<T>(
  props: TableProps<T>,
  base: ReturnType<typeof tableBase<T>>,
  pick: (key: string, event: MouseEvent) => void,
  element: () => HTMLElement | undefined,
) {
  const [id, level, cols, keyOf, read, title, , , sel, open, , , sheet] = base
  const hasDetails = untrack(
    () => props.expand !== undefined || props.columns.some((c) => c.priority),
  )
  const toggle = (row: T, from: HTMLElement) => {
    if (props.details === 'sheet' && (element()?.clientWidth ?? 1000) < 1000) {
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

  return [ctx, hasDetails, closeSheet] as const
}
