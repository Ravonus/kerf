import type { VirtualAlign, VirtualKey } from '@kerf/veneer-core'

/** What a list hands out through `control`, to scroll and measure from outside. */
export interface VirtualControl {
  scrollTo(key: VirtualKey, align?: VirtualAlign): void
  scrollToEnd(): void
  /** Render the row, wherever it is, and move focus to it. */
  focus(key: VirtualKey): void
  /** Move focus by rows from the focused one. */
  move(by: number): void
  /** The key of the focused or last-focused row. */
  active(): VirtualKey | undefined
}

/** Props for VirtualList. */
export interface VirtualListProps<T> {
  items: readonly T[]
  rowKey: (item: T) => VirtualKey
  children: (item: () => T, index: () => number) => unknown
  /** The list's name. */
  label?: string | undefined
  /** The row's text. Rows get exact heights before they render when the app has `text.measure`, and it's measured otherwise. */
  text?: (item: T) => string | null | undefined
  /** Rows that look different around the same text: each gets its own measurement of everything but the text. */
  variant?: ((item: T) => string) | undefined
  /** A row's height before it's known. Default 48. */
  estimate?: number | undefined
  /** Pixels between rows. */
  gap?: number | undefined
  /** Pixels of rows kept rendered past each edge of the view, so a fast scroll shows no gaps. */
  overscan?: number | undefined
  /** Rows on the server and in the first paint. Default 20. */
  initial?: number | undefined
  /** Stay at the end as rows arrive while the user is within this many pixels of it. */
  stick?: number | undefined
  /** `end` opens at the last row and grows upward, as a chat does. */
  from?: 'start' | 'end' | undefined
  /** `list` by default (rows are `listitem`s; `group` with `bareRows`); `feed`, `log` and the rest bring their own row role. */
  role?: string | undefined
  /** The role each row takes, such as `option` or `article`. */
  rowRole?: string | undefined
  /** Rows take no list semantics: what's inside them says what it is, and the scroller is a labelled group. */
  bareRows?: boolean | undefined
  /** Keep this role off the scroller and put it on the list inside. */
  inner?: boolean | undefined
  /** `ol` renders an ordered list with <li> rows; `div` otherwise. */
  tag?: 'div' | 'ol' | undefined
  /** Row keys move focus: ↑/↓, Home/End, one tab stop on the rows. */
  roving?: boolean | undefined
  /** The total isn't the list's to know (a log with history to load): `aria-setsize` is -1, and an arrival writes no row. */
  open?: boolean | undefined
  /** On a key the list doesn't use. */
  onRowKey?: ((e: KeyboardEvent, control: VirtualControl) => void) | undefined
  /** Called when the view nears the first row: load older rows. */
  onStart?: (() => void) | undefined
  /** Called when the view nears the last row: load more. */
  onEnd?: (() => void) | undefined
  /** Called with `true` when the list starts holding to the end, and `false` when the user scrolls away. */
  onStick?: ((stuck: boolean) => void) | undefined
  /** Called when a row's measured height differs from the estimate, with both heights. For tuning. */
  onDrift?: ((index: number, predicted: number, actual: number) => void) | undefined
  /** Hands over a control to scroll to, focus or move between rows from outside. */
  control?: ((c: VirtualControl) => void) | undefined
  /** The scroller's tabindex. Default 0, none with `roving`. */
  tabindex?: number | undefined
  /** The scroller's `data-scope`, for styling it as another component. */
  scope?: string | undefined
  /** The scroller's `data-part`, when it is a part of a larger component. */
  part?: string | undefined
  /** The inner list's `data-scope`. */
  listScope?: string | undefined
  height?: string | undefined
  /** `aria-busy`: more is loading. */
  busy?: boolean | undefined
  class?: string | undefined
}
