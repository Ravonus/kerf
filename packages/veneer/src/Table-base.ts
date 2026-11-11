// Per-instance table state and column access.
import { derived, state, untrack, type State } from '@kerf-js/core'
import { uid } from '@kerf-js/veneer-core'
import type { Column, TableProps, TableSort } from './Table-types'

const CARDS_BELOW = 480
const isState = (r: object | null | undefined): r is State<unknown> =>
  r != null && !Array.isArray(r) && 'value' in r

/** Initialize the table's per-instance state. */
export function tableBase<T>(input: TableProps<T>) {
  const rowKey = () => (input.rowKey === undefined ? 'id' : input.rowKey)
  const id = uid('tbl')
  const level = untrack(() => (input.heading === undefined ? 2 : input.heading))
  const cols = derived(() => input.columns)
  const keyOf = (r: T) =>
    String(
      typeof rowKey() === 'function'
        ? (rowKey() as (row: T) => string)(r)
        : (r as Record<string, unknown>)[rowKey() as string],
    )
  const read = (c: Column<T>, r: T) => (c.value ? c.value(r) : (r as Record<string, unknown>)[c.id])
  const named = derived(() => cols.value.find((c) => c.rowHeader) ?? cols.value[0])
  const title = (r: T) =>
    String((read(named.value!, r) as string | number | null | undefined) ?? '')

  const typed = untrack(() => input.query) ?? state('')
  const order = untrack(() => input.sort) ?? state<TableSort | undefined>(undefined)
  const given = untrack(() => input.selection)
  const sel = given ? (given === true ? state<Record<string, boolean>>({}) : given) : undefined
  const open = state<Record<string, boolean>>({})
  const startHidden = untrack(() => input.hiddenColumns)
  const hidden: State<readonly string[]> = isState(startHidden)
    ? startHidden
    : state<readonly string[]>(startHidden ?? [])
  const at = state(0)
  const sheet = state<{ row: T; from: HTMLElement } | undefined>(undefined)
  const picking = state(false)
  // the panel is built on first open and kept, so a closed table carries none of its checkboxes
  const picked = state(false)
  const width = state<number | undefined>(undefined)
  const shape = derived(() =>
    (input.phone === undefined ? 'cards' : input.phone) === 'cards' &&
    (width.value ?? 0) >= CARDS_BELOW
      ? 'columns'
      : input.phone === undefined
        ? 'cards'
        : input.phone,
  )

  return [
    id,
    level,
    cols,
    keyOf,
    read,
    title,
    typed,
    order,
    sel,
    open,
    hidden,
    at,
    sheet,
    picking,
    picked,
    width,
    shape,
  ] as const
}
