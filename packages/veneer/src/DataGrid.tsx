import type { Aggregate, GridFilter } from '@kerf/veneer-core'
import { untrack, type State } from '@kerf/core'
import { gridController } from './DataGrid-controller'
import { GridToolbar } from './DataGrid-toolbar'
import { GridViewport } from './DataGrid-viewport'
import { PaginationBar } from './Pagination'
import type { Column, TableSort } from './Table'
import '@kerf/veneer-core/styles/data/chips.css'
import '@kerf/veneer-core/styles/data/chip.css'

/** A Table column with what the grid adds: a filter, aggregates and formatted text. */
export interface GridColumn<T> extends Column<T> {
  /** A control in the filter row: contains, one of `options`, or at least. */
  filter?: GridFilter
  options?: string[] | undefined
  /** What the footer, a group's subtotal and a parent's roll-up show for this column. */
  aggregate?: Aggregate | ((rows: T[]) => unknown)
  /** Text for an aggregate, and for the cell when it has no `cell`. */
  format?: ((value: unknown) => string) | undefined
}

/** A saved view (06 §6). */
export type GridView = {
  order: string[]
  hidden: string[]
  filters: Record<string, string>
  sort?: TableSort
  group?: boolean | undefined
}

/** How the grid reads a hierarchy, and loads a branch on demand. */
export interface GridTree<T> {
  /** What's already here under a row. Default `row.kids`. */
  kids?: (row: T) => readonly T[] | undefined
  /** Fetch a branch on its first open. The filter's query goes along for the server to apply. */
  load?: (row: T, query: string) => Promise<readonly T[]>
  /** Has it children, loaded or not? Default: any in `kids`, or `row.hasChildren`. */
  branch?: ((row: T) => boolean) | undefined
  /** The server's aggregate for a branch that hasn't loaded. */
  rollup?: (row: T, column: string) => unknown
}

/** One cell of a paste, for the grid to accept or refuse. */
export interface GridPaste<T> {
  row: T
  column: string
  value: unknown
}

/** Props for DataGrid. */
export interface DataGridProps<T> {
  /** The rows, as an array or a State of one. */
  rows: readonly T[] | State<readonly T[]>
  /** The columns, in order: as in Table, plus `filter`, `options`, `aggregate` and `format`. */
  columns: GridColumn<T>[]
  /** Names the grid (required). It stays in the accessibility tree when `captionHidden`. */
  caption: string
  /** Hides the caption on screen. Screen readers still hear it as the grid's name. */
  captionHidden?: boolean | undefined
  /** The field that identifies a row, or a function that returns it. Keys a row's selection, edits and saved state. Default `id`. */
  rowKey?: (string | ((row: T) => string)) | undefined
  /** Row height and cell padding: `compact` fits the most rows, `comfortable` reads easiest. Default `cozy`. */
  density?: 'compact' | 'cozy' | 'comfortable' | undefined
  /** The named views in the select. */
  views?: Record<string, GridView> | undefined
  /** Starts on this view. */
  view?: string | undefined
  /** Save view pressed: the new view's name (`My view 1`) and its columns, filters, sort and grouping, for you to keep. */
  onSaveView?: ((name: string, view: GridView) => void) | undefined
  /** The Group toggle groups by this column. */
  groupBy?: string | undefined
  /** role=treegrid over hierarchical rows. */
  tree?: GridTree<T> | undefined
  /** Show the tree's filter field, labelled this. */
  filter?: string | undefined
  /** A cell edit committed: the row, the column's id and the new value. A column takes edits when it has `edit`. */
  onEdit?: ((row: T, column: string, value: unknown) => void) | undefined
  /** A validated paste, as one change. Default each cell through `onEdit`. */
  onPaste?: ((changes: GridPaste<T>[]) => void) | undefined
  /** A row's details, under it. */
  expand?: ((row: T) => unknown) | undefined
  /** The bulk bar's actions, over the rows in the range. */
  bulk?: ((rows: string[]) => unknown) | undefined
  /** Shows `size` rows at a time, with a pagination bar under them. */
  page?: { size: number } | undefined
  /** The CSV's name; `false` drops Export. */
  exportName?: string | false | undefined
  /** Your own controls in the toolbar, before Filters, Group, Columns and Export. */
  actions?: unknown
  /** A CSS height past which the rows scroll under a sticky header, such as `480px`. */
  maxHeight?: string | undefined
}

const REORDER = 'Alt plus left or right arrow moves this column.'

/**
 * The data grid (06 §6; data.html:1643-1787, treegrid 2482): a Table's parts as role=grid, or treegrid when grouped or
 * hierarchical, with one tab stop. Arrows move the cell, Shift extends a range, ⌘/Ctrl C copies it as TSV, Enter or F2
 * edits and an invalid value never commits. Headers reorder by dragging or Alt + ←/→. A filter row with applied chips,
 * group and aggregate rows, saved views, CSV, a bulk bar and details. Rows and cells are keyed, so a reorder moves nodes.
 */
export function DataGrid<T>(props: DataGridProps<T>) {
  const model = gridController(untrack(() => props))
  return (
    <div
      ref={(n) => (model.refs.el = n)}
      data-scope="table"
      data-phone="columns"
      data-density={props.density}
      data-tree={props.tree ? '' : undefined}
      id={model.id}
    >
      <GridToolbar model={model} props={props} />
      {props.bulk && (
        <div
          data-part="bulk"
          hidden={model.chosen().length === 0}
          role="region"
          aria-label="Bulk actions"
        >
          <b>{model.chosen().length} selected</b>
          {props.bulk(model.chosen())}
        </div>
      )}
      <GridViewport model={model} props={props} />
      <div data-part="footer">
        <span id={`${model.id}-hint`}>{model.hint()}</span>
        <span aria-live="polite">{model.status.value}</span>
      </div>
      {model.paged.value && (
        <PaginationBar
          total={model.ordered.value.length}
          page={model.at}
          size={props.page!.size}
          sizes={[props.page!.size]}
        />
      )}
      <span data-part="sr-only" id={`${model.id}-move`}>
        {REORDER}
      </span>
    </div>
  )
}

export { PivotTable, type PivotMeasure } from './DataGrid-pivot'
