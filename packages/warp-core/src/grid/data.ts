// The data grid's logic and behaviour (06 §6, §8). The pure helpers lay out the page list, filter, group, flatten a
// tree, pivot and write TSV and CSV; the `grid` action owns what never re-renders a row: the roving tab stop, the
// range selection (aria-selected on cells), the clipboard, and the header's drag and Alt + arrows. Rows are the binding's.

/** The page buttons around `cur` of `total` (1-based): both ends, its neighbours, and 'gap' for what's skipped. */
export function pageList(cur: number, total: number): (number | 'gap')[] {
  const near = [...new Set([1, cur - 1, cur, cur + 1, total])]
    .filter((p) => p >= 1 && p <= total)
    .sort((a, b) => a - b)
  const out: (number | 'gap')[] = []
  near.forEach((p, i) => {
    const skip = i ? p - near[i - 1]! : 1
    if (skip === 2) out.push(p - 1) // a gap of one page is that page
    else if (skip > 2) out.push('gap')
    out.push(p)
  })
  return out
}

/** Load more as `el`, the sentinel, comes within 120px of view (06 §8). The button beside it is the fallback. */
export function infiniteScroll(
  el: HTMLElement,
  opts: { onReach(): void; root?: HTMLElement | null | undefined },
) {
  let o = opts
  const Observer = el.ownerDocument.defaultView?.IntersectionObserver
  const seen =
    Observer &&
    new Observer(
      ([e]) => {
        if (e!.isIntersecting) o.onReach()
      },
      { root: o.root ?? null, rootMargin: '120px' },
    )
  seen?.observe(el)
  return { update: (next: typeof opts) => void (o = next), destroy: () => seen?.disconnect() }
}

/** How a filter row reads its value. */
export type GridFilter = 'text' | 'select' | 'min'

/** A cell against a filter row's value: contains, equals or at least. A blank filter keeps everything. */
export function matchFilter(kind: GridFilter | undefined, wanted: string, value: unknown) {
  if (!kind || wanted === '') return true
  if (kind === 'select') return String(value) === wanted
  if (kind === 'min') return Number(value) >= Number(wanted)
  // oxlint-disable-next-line typescript/no-base-to-string -- a cell is whatever the app put there: coercing it is the point
  return String(value ?? '')
    .toLowerCase()
    .includes(wanted.toLowerCase())
}

/** Rows by `key`, in the order each group first appears. */
export function groupRows<T>(rows: readonly T[], key: (row: T) => string) {
  const groups = new Map<string, T[]>()
  for (const r of rows) {
    const k = key(r)
    const g = groups.get(k)
    if (g) g.push(r)
    else groups.set(k, [r])
  }
  return groups
}

/** The aggregates a grid column can show. */
export type Aggregate = 'sum' | 'avg' | 'count' | 'min' | 'max'

/** A column's aggregate over `values`; blanks don't count towards an average. */
export function aggregate(kind: Aggregate, values: readonly unknown[]) {
  const n = values.filter((v) => v != null && v !== '').map(Number)
  if (kind === 'count') return n.length
  if (!n.length) return 0
  const sum = n.reduce((a, b) => a + b, 0)
  return kind === 'sum'
    ? sum
    : kind === 'avg'
      ? sum / n.length
      : kind === 'min'
        ? Math.min(...n)
        : Math.max(...n)
}

/** A tree row flattened for the grid, with the place it holds among its siblings. */
export interface TreeEntry<T> {
  row: T
  key: string
  level: number
  size: number
  pos: number
  parent?: string | undefined
  branch: boolean
  context?: boolean | undefined
  hit?: boolean | undefined
}

/** How a grid reads a tree out of the app's rows. */
export interface TreeSource<T> {
  key(row: T): string
  /** What's loaded under a row: undefined when it hasn't loaded yet, [] for a leaf. */
  kids(row: T): readonly T[] | undefined
  /** Could it have children? A branch not loaded yet says so here. */
  branch(row: T): boolean
  open(key: string): boolean
  /** A closed branch stays closed during a query (06 §6 Filter). */
  closed?(key: string): boolean
  match?: ((row: T) => boolean) | undefined
}

/**
 * The visible rows of a tree, depth first, with their aria-level, -setsize and -posinset counting only the visible
 * siblings. With `match`, a row shows when it or a descendant matches; ancestors open for the query (unless closed
 * by hand) and an ancestor there only for context is marked.
 */
export function treeRows<T>(roots: readonly T[], s: TreeSource<T>) {
  const out: TreeEntry<T>[] = []
  const keep = new Map<T, boolean>()
  const wanted = (row: T): boolean => {
    let on = keep.get(row)
    if (on === undefined) {
      on = !!s.match?.(row)
      for (const k of s.kids(row) ?? []) if (wanted(k)) on = true
      keep.set(row, on)
    }
    return on
  }
  const walk = (rows: readonly T[], level: number, parent?: string) => {
    const shown = s.match ? rows.filter(wanted) : rows
    shown.forEach((row, i) => {
      const key = s.key(row)
      const hit = s.match ? s.match(row) : undefined
      const branch = s.branch(row)
      out.push({
        row,
        key,
        level,
        size: shown.length,
        pos: i + 1,
        parent,
        branch,
        hit,
        context: s.match ? !hit : undefined,
      })
      const kids = s.kids(row)
      const open = s.match ? !s.closed?.(key) : s.open(key)
      if (branch && open && kids) walk(kids, level + 1, key)
    })
  }
  walk(roots, 1)
  return out
}

/** The leaves under a row, what a parent rolls up. */
export function leaves<T>(row: T, kids: (row: T) => readonly T[] | undefined): T[] {
  const under = kids(row)
  return under?.length ? under.flatMap((k) => leaves(k, kids)) : [row]
}

/** One pivot cell: the value and its share of the row. */
export interface PivotCell {
  value: number
  share: number
}

/** rows × columns × measure (06 §6): cells with their share of the largest (the heat), totals both ways. */
export function pivotTable<T>(
  rows: readonly T[],
  rowKey: (r: T) => string,
  colKey: (r: T) => string,
  measure: (r: T) => number,
) {
  const rowKeys = [...new Set(rows.map(rowKey))]
  const colKeys = [...new Set(rows.map(colKey))]
  const sum = (test: (r: T) => boolean) => rows.reduce((n, r) => (test(r) ? n + measure(r) : n), 0)
  const raw = rowKeys.map((rk) =>
    colKeys.map((ck) => sum((r) => rowKey(r) === rk && colKey(r) === ck)),
  )
  const top = Math.max(0, ...raw.flat()) || 1
  return {
    rowKeys,
    colKeys,
    cells: raw.map((line) => line.map<PivotCell>((value) => ({ value, share: value / top }))),
    rowTotals: rowKeys.map((rk) => sum((r) => rowKey(r) === rk)),
    colTotals: colKeys.map((ck) => sum((r) => colKey(r) === ck)),
    total: sum(() => true),
  }
}

/** A copied range. Tabs and line breaks inside a cell would split it, so they become spaces. */
// oxlint-disable typescript/no-base-to-string -- a cell is whatever the app put there: coercing it is the point
export const toTSV = (rows: readonly (readonly unknown[])[]) =>
  rows
    .map((r) =>
      r
        .map((c) =>
          String(c ?? '') /* oxlint-enable typescript/no-base-to-string */
            .replace(/[\t\r\n]+/g, ' '),
        )
        .join('\t'),
    )
    .join('\n')
/** A pasted TSV as rows of cells. */
export const parseTSV = (text: string) =>
  text
    .replace(/\r\n?/g, '\n')
    .replace(/\n$/, '')
    .split('\n')
    .map((l) => l.split('\t'))

const csvCell = (c: unknown) => {
  // oxlint-disable-next-line typescript/no-base-to-string -- a cell is whatever the app put there: coercing it is the point
  const s = String(c ?? '')
  // a leading = + - @ runs as a formula when a spreadsheet opens the file
  const safe = /^[=+\-@\t\r]/.test(s) && typeof c !== 'number' ? `'${s}` : s
  return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe
}
/** Rows as CSV, with cells a spreadsheet would run as formulas made safe. */
export const toCSV = (head: readonly unknown[], rows: readonly (readonly unknown[])[]) =>
  [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\n')
/** Move `item` so it sits at `to`, in a copy. */
export function moved<T>(list: readonly T[], item: T, to: number) {
  const rest = list.filter((x) => x !== item)
  rest.splice(Math.max(0, Math.min(rest.length, to)), 0, item)
  return rest
}
