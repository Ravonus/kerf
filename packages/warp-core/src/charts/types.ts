import type { Kid } from './scene'

/** What a form asks of the running chart: the legend's hidden series, the mark radius in px, an id for gradients. */
export type Ctx = { id: string; hidden: ReadonlySet<number>; r: number; view?: { b0: number; b1: number } | undefined }
export type TipRow = [color: string, label: string, value: string, dim?: boolean]
/** What a tooltip shows. */
export type Tip = { title?: string; rows?: TipRow[] }
/** What a form draws at a given width. */
export type Plot = {
  h: number
  w?: number
  style?: string
  /** Scene nodes, nested and falsy entries allowed. */
  body: readonly Kid[]
  /** The tooltip for a mark; the mark's aria-label when absent. */
  tip?: (xi: number, si: number, el: Element) => Tip
  /** The mark a pointer at plot (x, y) reads, as a selector: line charts read the nearest x, not the mark under it. */
  pick?: (x: number, y: number) => string | null
  /** A mark became active (null: none is). */
  on?: (el: Element | null, svg: Element) => void
}
/** One entry in a chart's legend. */
export type LegendItem = { name: string; color: string; value?: string }
/** A chart's data as a table, for the table view. */
export type TableData = { head: string[]; rows: (string | number)[][] }
export type Api = { svg: Element; draw: () => void; ctx: Ctx }
/** One chart form: everything it draws is a pure function of its config and width. */
export type Form<C> = {
  kind: string
  plot(c: C, w: number, x: Ctx): Plot
  table(c: C): TableData
  summary(c: C): string
  legend?(c: C): LegendItem[]
  /** Legend swatch shape. */
  swatch?: 'line' | 'box'
  /** The legend names marks (a donut's slices), so hovering an item activates its mark. */
  byMark?: boolean
  /** The legend is the sequential ramp from this step, not series. */
  ramp?: 0 | 1
  /** Updates arrive as a stream: swap values, never tween. */
  live?: boolean
  /** Interaction of its own beyond the shared model; returns a cleanup. */
  behave?(api: Api): () => void
}
export type Base<D> = { data: D; title: string; summary?: string | ((c: { data: D; title: string }) => string) }
export type Fmt = (v: number) => string
export const tableOf = (head: string[], rows: (string | number)[][]): TableData => ({ head, rows })
