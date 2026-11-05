import { nextIndex } from './focus'

// ---- trace ---------------------------------------------------------------------------------------------------------

/** One span of an agent run, with its children. */
export interface TraceSpan {
  id: string
  name: string
  start: number
  ms: number
  tokens?: number | undefined
  cost?: number | undefined
  children?: TraceSpan[]
}
/** A span flattened for the tree grid, carrying its level and place among its siblings. */
export interface TraceRow {
  id: string
  name: string
  ms: number
  tokens?: number | undefined
  cost?: number | undefined
  level: number
  pos: number
  size: number
  parent?: string | undefined
  branch: boolean
  open: boolean
  x: number
  w: number
  color: number
}

/** The visible rows of a span tree in order, on one time axis: x and w are fractions of the whole run. */
export function traceRows(
  spans: TraceSpan[],
  collapsed: ReadonlySet<string> = new Set(),
): TraceRow[] {
  let lo = Infinity,
    hi = -Infinity
  const scan = (s: TraceSpan) => {
    lo = Math.min(lo, s.start)
    hi = Math.max(hi, s.start + s.ms)
    s.children?.forEach(scan)
  }
  spans.forEach(scan)
  const span = hi - lo || 1
  const rows: TraceRow[] = []
  let order = 0
  const walk = (list: TraceSpan[], level: number, parent: string | undefined, show: boolean) =>
    list.forEach((s, i) => {
      const color = (order++ % 8) + 1
      const branch = !!s.children?.length,
        open = branch && !collapsed.has(s.id)
      if (show)
        rows.push({
          id: s.id,
          name: s.name,
          ms: s.ms,
          tokens: s.tokens,
          cost: s.cost,
          level,
          pos: i + 1,
          size: list.length,
          parent,
          branch,
          open,
          x: (s.start - lo) / span,
          w: s.ms / span,
          color,
        })
      if (branch) walk(s.children!, level + 1, s.id, show && open)
    })
  walk(spans, 1, undefined, true)
  return rows
}

/** APG treegrid keys over visible rows: which row to focus, or which branch to toggle. */
export function traceKey(
  key: string,
  rows: TraceRow[],
  at: number,
  rtl = false,
): { focus?: string | undefined; toggle?: string } | null {
  const row = rows[at]!
  const [open, close] = rtl ? ['ArrowLeft', 'ArrowRight'] : ['ArrowRight', 'ArrowLeft']
  if (key === 'Enter' || key === ' ') return row.branch ? { toggle: row.id } : {}
  if (key === open)
    return row.branch && !row.open
      ? { toggle: row.id }
      : row.branch
        ? { focus: rows[at + 1]?.id }
        : {}
  if (key === close)
    return row.branch && row.open ? { toggle: row.id } : row.parent ? { focus: row.parent } : {}
  const to = nextIndex(key, at, rows.length, { orientation: 'vertical' })
  return to < 0 ? null : { focus: rows[to]!.id }
}
