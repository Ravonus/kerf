// The data grid's logic and behaviour (06 §6, §8). The pure helpers lay out the page list, filter, group, flatten a
// tree, pivot and write TSV and CSV; the `grid` action owns what never re-renders a row: the roving tab stop, the
// range selection (aria-selected on cells), the clipboard, and the header's drag and Alt + arrows. Rows are the binding's.

/** The page buttons around `cur` of `total` (1-based): both ends, its neighbours, and 'gap' for what's skipped. */
export function pageList(cur: number, total: number): (number | 'gap')[] {
  const near = [...new Set([1, cur - 1, cur, cur + 1, total])].filter(p => p >= 1 && p <= total).sort((a, b) => a - b)
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
export function infiniteScroll(el: HTMLElement, opts: { onReach(): void; root?: HTMLElement | null | undefined }) {
  let o = opts
  const Observer = el.ownerDocument.defaultView?.IntersectionObserver
  const seen = Observer && new Observer(([e]) => { if (e!.isIntersecting) o.onReach() }, { root: o.root ?? null, rootMargin: '120px' })
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
  return String(value ?? '').toLowerCase().includes(wanted.toLowerCase())
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
  const n = values.filter(v => v != null && v !== '').map(Number)
  if (kind === 'count') return n.length
  if (!n.length) return 0
  const sum = n.reduce((a, b) => a + b, 0)
  return kind === 'sum' ? sum : kind === 'avg' ? sum / n.length : kind === 'min' ? Math.min(...n) : Math.max(...n)
}

/** A tree row flattened for the grid, with the place it holds among its siblings. */
export interface TreeEntry<T> { row: T; key: string; level: number; size: number; pos: number; parent?: string | undefined; branch: boolean; context?: boolean | undefined; hit?: boolean | undefined }

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
      out.push({ row, key, level, size: shown.length, pos: i + 1, parent, branch, hit, context: s.match ? !hit : undefined })
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
  return under?.length ? under.flatMap(k => leaves(k, kids)) : [row]
}

/** One pivot cell: the value and its share of the row. */
export interface PivotCell { value: number; share: number }

/** rows × columns × measure (06 §6): cells with their share of the largest (the heat), totals both ways. */
export function pivotTable<T>(rows: readonly T[], rowKey: (r: T) => string, colKey: (r: T) => string, measure: (r: T) => number) {
  const rowKeys = [...new Set(rows.map(rowKey))]
  const colKeys = [...new Set(rows.map(colKey))]
  const sum = (test: (r: T) => boolean) => rows.reduce((n, r) => (test(r) ? n + measure(r) : n), 0)
  const raw = rowKeys.map(rk => colKeys.map(ck => sum(r => rowKey(r) === rk && colKey(r) === ck)))
  const top = Math.max(0, ...raw.flat()) || 1
  return {
    rowKeys, colKeys,
    cells: raw.map(line => line.map<PivotCell>(value => ({ value, share: value / top }))),
    rowTotals: rowKeys.map(rk => sum(r => rowKey(r) === rk)),
    colTotals: colKeys.map(ck => sum(r => colKey(r) === ck)),
    total: sum(() => true),
  }
}

/** A copied range. Tabs and line breaks inside a cell would split it, so they become spaces. */
// oxlint-disable-next-line typescript/no-base-to-string -- a cell is whatever the app put there: coercing it is the point
export const toTSV = (rows: readonly (readonly unknown[])[]) => rows.map(r => r.map(c => String(c ?? '').replace(/[\t\r\n]+/g, ' ')).join('\t')).join('\n')
/** A pasted TSV as rows of cells. */
export const parseTSV = (text: string) => text.replace(/\r\n?/g, '\n').replace(/\n$/, '').split('\n').map(l => l.split('\t'))

const csvCell = (c: unknown) => {
  // oxlint-disable-next-line typescript/no-base-to-string -- a cell is whatever the app put there: coercing it is the point
  const s = String(c ?? '')
  // a leading = + - @ runs as a formula when a spreadsheet opens the file
  const safe = /^[=+\-@\t\r]/.test(s) && typeof c !== 'number' ? `'${s}` : s
  return /[",\n\r]/.test(safe) || safe !== s ? `"${safe.replace(/"/g, '""')}"` : safe
}
/** Rows as CSV, with cells a spreadsheet would run as formulas made safe. */
export const toCSV = (head: readonly unknown[], rows: readonly (readonly unknown[])[]) => [head, ...rows].map(r => r.map(csvCell).join(',')).join('\n')

/** Move `item` so it sits at `to`, in a copy. */
export function moved<T>(list: readonly T[], item: T, to: number) {
  const rest = list.filter(x => x !== item)
  rest.splice(Math.max(0, Math.min(rest.length, to)), 0, item)
  return rest
}

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

type At = [row: number, col: number]
const PAGE = 5 // PageUp/PageDown, in rows (06 §6)

/** Attach to `[data-scope="table"]` around a role=grid or treegrid table. */
export function grid(root: HTMLElement, opts: GridOptions) {
  let o = opts
  const doc = root.ownerDocument
  const rows = () => [...root.querySelectorAll<HTMLElement>('tbody > tr[data-row]')]
  const cells = (tr?: HTMLElement) => (tr ? [...tr.children] as HTMLElement[] : [])
  // col -1 is the row itself, in a treegrid
  let at: At = [0, o.tree ? -1 : 0]
  let anchor: At | undefined
  let current: HTMLElement | undefined

  const target = (p: At) => { const tr = rows()[p[0]]; return p[1] < 0 ? tr : cells(tr)[Math.min(p[1], cells(tr).length - 1)] }
  const settle = () => {
    const r = rows()
    at = [Math.max(0, Math.min(at[0], r.length - 1)), at[1] < 0 && !o.tree ? 0 : at[1]]
    const el = target(at)
    if (current !== el) { if (current) current.tabIndex = -1 }
    if (el) el.tabIndex = 0
    current = el
    return el
  }
  const selected = () => [...root.querySelectorAll<HTMLElement>('tbody [aria-selected="true"]')]
  const paint = (a?: At, b?: At) => {
    for (const c of selected()) c.removeAttribute('aria-selected')
    const touched = new Set<string>()
    if (a && b) {
      const all = rows()
      for (let r = Math.min(a[0], b[0]); r <= Math.max(a[0], b[0]); r++) for (let c = Math.min(a[1], b[1]); c <= Math.max(a[1], b[1]); c++) {
        const cell = cells(all[r])[c]
        if (!cell) continue
        cell.setAttribute('aria-selected', 'true')
        touched.add(all[r]!.dataset.row!)
      }
    }
    o.onSelect?.([...touched])
  }
  const go = (p: At, extend = false) => {
    if (extend && p[1] >= 0 && at[1] >= 0) { anchor ??= at; paint(anchor, p) }
    else { anchor = p[1] >= 0 ? p : undefined; paint() }
    at = p
    settle()?.focus()
  }

  const copy = async () => {
    const picked = selected()
    const lines = new Map<Element, string[]>()
    for (const c of picked.length ? picked : [target(at)].filter(Boolean) as Element[]) {
      const line = lines.get(c.parentElement!) ?? []
      line.push(c.textContent.trim())
      lines.set(c.parentElement!, line)
    }
    const table = [...lines.values()]
    if (!table.length) return
    await doc.defaultView!.navigator.clipboard?.writeText(toTSV(table)).catch(() => {})
    for (const c of picked) { c.removeAttribute('data-copied'); void c.offsetWidth; c.setAttribute('data-copied', '') }
    o.onStatus?.(`Copied ${table.length} × ${table[0]!.length} cells`)
  }

  const parentOf = (i: number, all: HTMLElement[]) => {
    const level = +all[i]!.getAttribute('aria-level')!
    for (let j = i - 1; j >= 0; j--) if (+all[j]!.getAttribute('aria-level')! < level) return j
    return -1
  }
  const onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement
    const head = el.closest?.('thead th[data-col]') as HTMLElement | null
    if (head && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      const heads = [...root.querySelectorAll<HTMLElement>('thead tr:first-child th[data-col]')]
      const rtl = getComputedStyle(root).direction === 'rtl'
      const by = (e.key === 'ArrowRight') !== rtl ? 1 : -1
      const to = Math.max(0, Math.min(heads.length - 1, heads.indexOf(head) + by))
      o.onReorder?.(head.dataset.col!, to)
      return
    }
    if (el.closest?.('input, select, textarea, [contenteditable]') || !el.closest?.('tbody')) return
    const all = rows()
    const k = e.key
    const mod = e.ctrlKey || e.metaKey
    if (mod && k.toLowerCase() === 'c') { e.preventDefault(); void copy(); return }
    const rtl = getComputedStyle(root).direction === 'rtl'
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
    const back = rtl ? 'ArrowRight' : 'ArrowLeft'
    const [r, c] = at
    const tr = all[r]
    if (!tr) return
    const expanded = tr.getAttribute('aria-expanded')
    const onRow = c < 0
    const last = cells(tr).length - 1
    if (k === 'Enter' || k === 'F2' || (k === ' ' && !e.shiftKey)) {
      const cell = onRow ? undefined : cells(tr)[c]
      if (k !== ' ' && cell?.hasAttribute('data-editable')) { e.preventDefault(); o.onEdit?.(cell); return }
      if (k === 'F2') return
      if (expanded !== null && (onRow || c === 0)) { e.preventDefault(); o.onToggle?.(tr, expanded !== 'true'); return }
      const button = cell?.querySelector<HTMLElement>('button, a[href]')
      if (button) { e.preventDefault(); button.click() }
      return
    }
    if (o.tree && onRow && k === forward) {
      e.preventDefault()
      if (expanded === 'false') o.onToggle?.(tr, true)
      else go([r, 0])
      return
    }
    if (o.tree && k === back && (onRow || c === 0)) {
      e.preventDefault()
      if (!onRow) go([r, -1])
      else if (expanded === 'true') o.onToggle?.(tr, false)
      else { const p = parentOf(r, all); if (p >= 0) go([p, -1]) }
      return
    }
    let next: At | undefined
    const clampRow = (v: number) => Math.max(0, Math.min(all.length - 1, v))
    const clampCol = (row: number, v: number) => (onRow ? -1 : Math.max(0, Math.min(cells(all[row]).length - 1, v)))
    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'PageDown' || k === 'PageUp') {
      const by = { ArrowDown: 1, ArrowUp: -1, PageDown: PAGE, PageUp: -PAGE }[k]
      const row = clampRow(r + by)
      next = [row, clampCol(row, c)]
    } else if (k === forward || k === back) next = onRow ? undefined : [r, clampCol(r, c + (k === forward ? 1 : -1))]
    else if (k === 'Home') next = mod ? [0, onRow ? -1 : 0] : onRow ? [0, -1] : [r, 0]
    else if (k === 'End') { const row = all.length - 1; next = mod ? [row, onRow ? -1 : cells(all[row]).length - 1] : onRow ? [row, -1] : [r, last] }
    else if (k === 'Escape') { if (selected().length) { e.preventDefault(); anchor = undefined; paint() } return }
    if (!next) return
    e.preventDefault()
    go(next, e.shiftKey)
  }
  const place = (e: Event) => {
    const el = e.target as HTMLElement
    if (el.closest?.('input, select, textarea, button, a, label')) return
    const cell = el.closest?.<HTMLElement>('tbody td, tbody th')
    const tr = cell?.parentElement as HTMLElement | undefined
    if (!cell || !tr?.dataset.row) return
    go([rows().indexOf(tr), cells(tr).indexOf(cell)], (e as MouseEvent).shiftKey)
  }
  const onDouble = (e: MouseEvent) => {
    const el = e.target as HTMLElement
    const cell = el.closest?.<HTMLElement>('tbody td, tbody th')
    if (!cell || el.closest?.('input, button')) return
    if (cell.hasAttribute('data-editable')) o.onEdit?.(cell)
    else { const tr = cell.parentElement!, open = tr.getAttribute('aria-expanded'); if (open !== null) o.onToggle?.(tr, open !== 'true') }
  }
  const onPaste = (e: ClipboardEvent) => {
    if (!o.onPaste || (e.target as HTMLElement).closest?.('input, select, textarea')) return
    const cell = target(at)
    const text = e.clipboardData?.getData('text/plain')
    if (!cell || !text || at[1] < 0) return
    e.preventDefault()
    o.onPaste(cell, parseTSV(text))
  }

  // the header's drag: the keyboard path is Alt + arrows above
  let dragged: string | undefined
  const heads = () => root.querySelectorAll<HTMLElement>('thead th[data-col]')
  const clearDrop = () => { for (const h of heads()) { h.removeAttribute('data-drop-before'); h.removeAttribute('data-drop-after') } }
  const onDragStart = (e: DragEvent) => {
    const th = (e.target as HTMLElement).closest?.<HTMLElement>('thead th[data-col]')
    if (!th) return
    dragged = th.dataset.col
    e.dataTransfer!.effectAllowed = 'move'
    e.dataTransfer!.setData('text/plain', dragged!)
  }
  const onDragOver = (e: DragEvent) => {
    const th = (e.target as HTMLElement).closest?.<HTMLElement>('thead th[data-col]')
    if (!th || !dragged) return
    e.preventDefault()
    const box = th.getBoundingClientRect()
    clearDrop()
    th.toggleAttribute(e.clientX > box.left + box.width / 2 ? 'data-drop-after' : 'data-drop-before', true)
  }
  const onDrop = (e: DragEvent) => {
    const th = (e.target as HTMLElement).closest?.<HTMLElement>('thead th[data-col]')
    if (!th || !dragged || th.dataset.col === dragged) return
    e.preventDefault()
    const order = [...root.querySelectorAll<HTMLElement>('thead tr:first-child th[data-col]')].map(h => h.dataset.col!).filter(c => c !== dragged)
    o.onReorder?.(dragged, order.indexOf(th.dataset.col!) + (th.hasAttribute('data-drop-after') ? 1 : 0))
  }
  const onDragEnd = () => { dragged = undefined; clearDrop() }

  const on: [string, (e: never) => void][] = [['keydown', onKey], ['click', place], ['dblclick', onDouble], ['paste', onPaste], ['dragstart', onDragStart], ['dragover', onDragOver], ['drop', onDrop], ['dragend', onDragEnd]]
  for (const [type, fn] of on) root.addEventListener(type, fn as EventListener)
  settle()
  return {
    update(next: GridOptions) {
      const changed = next.rows !== o.rows
      o = next
      if (!changed) return
      anchor = undefined
      if (selected().length) paint()
      // the row that held focus may have moved: find it again, so the tab stop stays on it
      const live = current?.isConnected ? current : undefined
      if (live) {
        const tr = live.closest<HTMLElement>('tr[data-row]') ?? live
        at = [rows().indexOf(tr), tr === live ? -1 : cells(tr).indexOf(live)]
      }
      settle()
    },
    /** Focus returns here after an edit. */
    refocus() { settle()?.focus() },
    destroy() { for (const [type, fn] of on) root.removeEventListener(type, fn as EventListener) },
  }
}
