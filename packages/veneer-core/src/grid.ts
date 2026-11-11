import { GridAction } from './grid/action'

export { pageList } from './grid/data'
export { infiniteScroll } from './grid/data'
export type { GridFilter } from './grid/data'
export { matchFilter } from './grid/data'
export { groupRows } from './grid/data'
export type { Aggregate } from './grid/data'
export { aggregate } from './grid/data'
export type { TreeEntry } from './grid/data'
export type { TreeSource } from './grid/data'
export { treeRows } from './grid/data'
export { leaves } from './grid/data'
export type { PivotCell } from './grid/data'
export { pivotTable } from './grid/data'
export { toTSV } from './grid/data'
export { parseTSV } from './grid/data'
export { toCSV } from './grid/data'
export { moved } from './grid/data'

/** Options for the data grid's keyboard, selection and clipboard. */
export interface GridOptions {
  /** Grouped or tree data: role=treegrid, where a row takes focus too. */
  tree?: boolean
  /** Anything that changes the rows or columns: the tab stop is placed again and the range clears. */
  rows?: unknown
  onEdit?(cell: HTMLElement): void
  /** Open or close a row. */
  onToggle?(row: HTMLElement, open: boolean): void
  onReorder?(column: string, to: number): void
  /** The range changed: the keys of its rows. */
  onSelect?(rows: string[]): void
  /** Told what a screen reader should hear. */
  onStatus?(text: string): void
  /** A TSV pasted at this cell. */
  onPaste?(cell: HTMLElement, rows: string[][]): void
}
/** Attach to the table around a role=grid or treegrid table. */
export function grid(root: HTMLElement, opts: GridOptions) {
  const action = new GridAction(root, opts)
  return {
    update(next: GridOptions) {
      action.update(next)
    },
    /** Focus returns here after an edit. */
    refocus() {
      action.refocus()
    },
    destroy() {
      action.destroy()
    },
  }
}
