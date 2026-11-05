import type { TableProps } from './Table-types'
import { tableModel } from './Table-model'
import { tableView } from './Table-view'
import './styles'
import '@weft-js/warp-core/styles/components/popover.css' // the Columns panel
import '@weft-js/warp-core/styles/data/tokens.css'
import '@weft-js/warp-core/styles/data/base.css'
import '@weft-js/warp-core/styles/data/table.css'
import '@weft-js/warp-core/styles/data/desc.css'

export { ColumnsPanel } from './Table-columns'
export { Editor, chevron } from './Table-rows'
export type { Column, ListPage, TableSort, TableStatus, TableProps } from './Table-types'
export { sortIcon } from './Table-head'
export { columnsIcon } from './Table-toolbar'

/* @weft visible: what it does by itself is fetch and measure, and focus only moves once someone is using it */
/**
 * A data table (06 §5; data.html:1095-1124): a semantic <table> with explicit ARIA roles, so they survive the phone
 * cards' display change. Sort, filter, Columns, resize, pin, selection with a bulk bar, details, inline edit and live
 * cells, in the states ready, loading, empty and error, inside one frame. Rows are keyed: a sort moves nodes, a new
 * value patches a cell. Given `T[]` it sorts, filters and pages by itself; a Resource or `server` leaves that to the
 * server and reports what was asked. Queries its own width, never the window.
 */
export function Table<T>({
  rows,
  caption,
  captionHidden,
  columns,
  rowKey = 'id',
  phone = 'cards',
  density,
  filter,
  query,
  sort,
  onSortChange,
  server,
  selection,
  onSelectionChange,
  bulk,
  page,
  onPageChange,
  expand,
  details = 'inline',
  onEdit,
  actions,
  picker = true,
  hiddenColumns,
  status,
  empty,
  error,
  onRetry,
  maxHeight,
  heading = 2,
}: TableProps<T>) {
  return tableView(
    tableModel({
      rows: () => rows,
      caption: () => caption,
      captionHidden: () => captionHidden,
      columns: () => columns,
      rowKey: () => rowKey,
      phone: () => phone,
      density: () => density,
      filter: () => filter,
      query: () => query,
      sort: () => sort,
      onSortChange: () => onSortChange,
      server: () => server,
      selection: () => selection,
      onSelectionChange: () => onSelectionChange,
      bulk: () => bulk,
      page: () => page,
      onPageChange: () => onPageChange,
      expand: () => expand,
      details: () => details,
      onEdit: () => onEdit,
      actions: () => actions,
      picker: () => picker,
      hiddenColumns: () => hiddenColumns,
      status: () => status,
      empty: () => empty,
      error: () => error,
      onRetry: () => onRetry,
      maxHeight: () => maxHeight,
      heading: () => heading,
    }),
  )
}
