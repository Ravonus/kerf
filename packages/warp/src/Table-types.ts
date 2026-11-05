import type { Derived, Resource, State } from '@weft-js/core'
import type { SortDir } from '@weft-js/warp-core'

/** One Table column. */
export interface Column<T> {
  id: string
  /** Text: it also labels the cell on a phone card and the Columns checkbox. */
  header: string
  /** What the cell holds, sorts by and filters on. Default `row[id]`. */
  value?: ((row: T) => unknown) | undefined
  /** How the cell draws it. Default the value as text. */
  cell?: ((row: T) => unknown) | undefined
  /** `true` sorts by `value`; a function sorts by what it returns. */
  sort?: (boolean | ((row: T) => unknown)) | undefined
  numeric?: boolean | undefined
  /** Sticky at the inline start. */
  pin?: boolean | undefined
  rowHeader?: boolean | undefined
  /** 2 hides under 760px of table width, 3 under 1000px; a row's details still list it. */
  priority?: 2 | 3 | undefined
  /** Where it goes on a phone card. */
  card?: 'title' | 'badge' | 'hide' | undefined
  resize?: boolean | undefined
  /** Inline edit: `true` commits the text, a function turns the text into the value. */
  edit?: (boolean | ((text: string) => unknown)) | undefined
  /** `true`, or the message to show: an invalid value never commits. */
  validate?: ((value: unknown) => string | boolean) | undefined
  /** A number that ticks: the cell flashes on change and the row is never rebuilt. */
  live?: boolean | undefined
}

/** The V2 list envelope. `next`/`prev` are cursors; absent means there is no such page. */
export type ListPage<T> = { items: T[]; total?: number; next?: unknown; prev?: unknown }
/** The column a table is sorted by, and which way. */
export type TableSort = { id: string; dir: SortDir }
/** What a table is showing in place of, or along with, its rows. */
export type TableStatus = 'ready' | 'loading' | 'empty' | 'error'

/** Props for Table. */
export interface TableProps<T> {
  rows:
    | readonly T[]
    | State<readonly T[]>
    | Derived<readonly T[]>
    | Resource<readonly T[] | ListPage<T>>
  /** Names the table (required, 06 §5). It stays in the accessibility tree when `captionHidden`. */
  caption: string
  /** Hides the caption on screen. Screen readers still hear it. */
  captionHidden?: boolean | undefined
  columns: Column<T>[]
  /** The field that identifies a row, or how to get it. Default `id`. */
  rowKey?: (string | ((row: T) => string)) | undefined
  /** `cards` stacks each row in a container under 480px wide; `columns` scrolls sideways instead. */
  phone?: 'cards' | 'columns' | undefined
  density?: 'compact' | 'cozy' | 'comfortable' | undefined
  /** Show the filter field, labelled this. */
  filter?: string | undefined
  /** A state holding the filter text, so you can read or set it. */
  query?: State<string> | undefined
  /** A state holding the sorted column and direction, so you can read or set it. */
  sort?: State<TableSort | undefined>
  /** Called with the column and direction when someone sorts. */
  onSortChange?: ((sort: TableSort) => void) | undefined
  /** The rows arrive sorted, filtered and paged (a Resource's are): the table only reports what's asked. */
  server?: boolean | undefined
  /** Checkboxes, Shift-click ranges and the bulk bar. */
  selection?: boolean | State<Record<string, boolean>> | undefined
  /** Called with the keys of every selected row after each change. */
  onSelectionChange?: ((keys: string[]) => void) | undefined
  /** The bulk bar's actions. */
  bulk?: ((keys: string[]) => unknown) | undefined
  page?: { size: number } | undefined
  /** Called on Next or Previous, with the page or server cursor to load. */
  onPageChange?: ((to: unknown, reason: 'next' | 'prev') => void) | undefined
  /** A row's details. Default a list of every column. */
  expand?: ((row: T) => unknown) | undefined
  /** inline (default): they slide open in place at every width. sheet: a panel over the table below 1000px. */
  details?: 'inline' | 'sheet' | undefined
  /** Called with the row, the column's id and the new value when a cell edit is committed. */
  onEdit?: ((row: T, column: string, value: unknown) => void) | undefined
  /** The toolbar's own actions. */
  actions?: unknown
  /** The Columns disclosure. */
  picker?: boolean | undefined
  /** Columns hidden from the start, in the server's HTML too. Bind a State to keep what people choose. */
  hiddenColumns?: readonly string[] | State<readonly string[]> | undefined
  /** Forces a state; a Resource's own is used otherwise. */
  status?: TableStatus | undefined
  /** What to show when there are no rows: a title, a line of text and an action. */
  empty?: { title?: unknown; text?: unknown; action?: unknown } | undefined
  error?: { title?: unknown; text?: unknown } | undefined
  /** Called by the error state's Retry. A Resource refreshes itself as well. */
  onRetry?: (() => void) | undefined
  /** A CSS height past which the body scrolls under a sticky header, such as `480px`. */
  maxHeight?: string | undefined
  /** The outline level of the table's state and sheet headings, under the page's h1. */
  heading?: number | undefined
}

export type Ctx<T> = {
  id: string
  level: number
  cols: () => Column<T>[]
  keyOf: (row: T) => string
  read: (c: Column<T>, row: T) => unknown
  sel: State<Record<string, boolean>> | undefined
  open: State<Record<string, boolean>>
  details: boolean
  span: () => number
  title: (row: T) => string
  pick: (key: string, e: MouseEvent) => void
  toggle: (row: T, from: HTMLElement) => void
  body: (row: T) => unknown
  edit?: ((row: T, column: string, value: unknown) => void) | undefined
}
