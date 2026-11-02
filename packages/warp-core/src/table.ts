// The table's logic and behaviour (06 §5). The pure helpers order, filter and slice rows and work out selection; the
// `table` action does what never touches a row: pin offsets, the scrolled shadow, column resize and the per-instance
// stylesheet that hides columns (one rule, no row re-renders). Rows are the binding's.

export type SortDir = 'ascending' | 'descending'

const COL_MIN = 80
const COL_MAX = 480
const COL_STEP = 16 // ←/→ on a resize handle (06 §5)

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })

/** Numbers and dates by value, text by the locale's collation with numbers in order; empty values sort last. */
export function compareValues(a: unknown, b: unknown) {
  if (a == null || a === '') return b == null || b === '' ? 0 : 1
  if (b == null || b === '') return -1
  if (typeof a === 'number' && typeof b === 'number') return a - b
  if (a instanceof Date && b instanceof Date) return +a - +b
  // oxlint-disable-next-line typescript/no-base-to-string -- a cell is whatever the app put there: coercing it is the point
  return collator.compare(String(a), String(b))
}

/** A sorted copy; the input order breaks ties. */
export function sortRows<T>(rows: readonly T[], value: (row: T) => unknown, dir: SortDir) {
  const sign = dir === 'ascending' ? 1 : -1
  return rows.map((row, i) => ({ row, i })).sort((x, y) => {
    const a = value(x.row), b = value(y.row)
    const empty = (v: unknown) => v == null || v === ''
    // empties stay last in both directions
    if (empty(a) !== empty(b)) return empty(a) ? 1 : -1
    return sign * compareValues(a, b) || x.i - y.i
  }).map(e => e.row)
}

/** Rows where any of `texts(row)` contains the query, case-insensitively. A blank query keeps them all. */
export function filterRows<T>(rows: readonly T[], query: string, texts: (row: T) => unknown[]) {
  const q = query.trim().toLowerCase()
  if (!q) return rows as T[]
  // oxlint-disable-next-line typescript/no-base-to-string -- a cell is whatever the app put there: coercing it is the point
  return rows.filter(r => texts(r).some(t => t != null && String(t).toLowerCase().includes(q)))
}

/** Page `page` of `size` (clamped to the last page), and the numbers the footer shows. */
export function pageSlice<T>(rows: readonly T[], page: number, size: number) {
  const pages = Math.max(1, Math.ceil(rows.length / size))
  const at = Math.min(Math.max(page, 0), pages - 1)
  return { rows: rows.slice(at * size, at * size + size), page: at, pages, from: rows.length ? at * size + 1 : 0, to: Math.min(rows.length, at * size + size) }
}

/** The keys from `anchor` to `key` inclusive in `order`, for a Shift-click; just `key` if the anchor has left. */
export function rangeOf<K>(order: readonly K[], anchor: K | undefined, key: K) {
  const a = anchor === undefined ? -1 : order.indexOf(anchor), b = order.indexOf(key)
  return a < 0 || b < 0 ? [key] : order.slice(Math.min(a, b), Math.max(a, b) + 1)
}

/** What the header checkbox shows for the page's keys. */
export function checkState<K>(keys: readonly K[], has: (key: K) => boolean) {
  const n = keys.filter(has).length
  return n === 0 ? 'none' : n === keys.length ? 'all' : 'some'
}

export interface TableOptions {
  /** Column ids hidden from view. */
  hidden: readonly string[]
  /** Anything that changes the rows, so pin offsets are measured again. */
  rows?: unknown
  /** Told the table's width whenever it changes, so a binding can mount what only a size needs. */
  onWidth?: (width: number) => void
}

/** The stylesheet that hides columns: one rule, so no row re-renders. */
export const hideRule = (id: string, ids: readonly string[]) => ids.map(c => `#${id} [data-col="${c}"]{display:none}`).join('')

/** Attach to `[data-scope="table"]`, which needs an id: the hide rule is scoped by it. */
export function table(root: HTMLElement, opts: TableOptions) {
  let o = opts
  const doc = root.ownerDocument
  const win = doc.defaultView!
  const viewport = () => root.querySelector<HTMLElement>('[data-part="viewport"]')
  // the binding renders it when columns start hidden, so the server's HTML is right before this runs
  const given = root.querySelector<HTMLStyleElement>(':scope > style[data-part="hide"]')
  const sheet = given ?? doc.createElement('style')
  if (!given) root.append(sheet)

  const hide = (ids: readonly string[]) => { const rule = hideRule(root.id, ids); if (sheet.textContent !== rule) sheet.textContent = rule }
  // the pinned column sits after the select column, whose width only the browser knows
  const pin = () => {
    const cells = root.querySelectorAll<HTMLElement>('[data-pinned="last"]')
    if (!cells.length) return // the width read forces a style and layout pass
    const w = root.querySelector<HTMLElement>('thead [data-part="select"]')?.offsetWidth ?? 0
    for (const c of cells) c.style.setProperty('--_pin-x', `${w}px`)
  }
  const value = (handle: Element) => handle.setAttribute('aria-valuenow', String((handle.closest('th') as HTMLElement).offsetWidth))
  const sync = () => { pin(); for (const h of root.querySelectorAll('[data-part="resize"]')) value(h) }
  const size = (handle: Element, w: number) => {
    const clamped = Math.min(COL_MAX, Math.max(COL_MIN, w))
    ;(handle.closest('th') as HTMLElement).style.minWidth = `${clamped}px`
    handle.setAttribute('aria-valuenow', String(Math.round(clamped)))
  }
  const onScroll = (e: Event) => root.toggleAttribute('data-scrolled', (e.currentTarget as HTMLElement).scrollLeft !== 0)
  const onKey = (e: KeyboardEvent) => {
    const handle = (e.target as Element).closest?.('[data-part="resize"]')
    if (!handle || (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight')) return
    e.preventDefault()
    const rtl = getComputedStyle(root).direction === 'rtl'
    const grow = (e.key === 'ArrowRight') !== rtl
    size(handle, (handle.closest('th') as HTMLElement).offsetWidth + (grow ? COL_STEP : -COL_STEP))
    pin()
  }
  const onDown = (e: PointerEvent) => {
    const handle = (e.target as Element).closest?.<HTMLElement>('[data-part="resize"]')
    if (!handle) return
    e.preventDefault()
    handle.setPointerCapture?.(e.pointerId)
    handle.setAttribute('data-active', '')
    const x0 = e.clientX
    const w0 = (handle.closest('th') as HTMLElement).offsetWidth
    const rtl = getComputedStyle(root).direction === 'rtl' ? -1 : 1
    const move = (ev: PointerEvent) => size(handle, w0 + (ev.clientX - x0) * rtl)
    const up = () => {
      handle.removeAttribute('data-active')
      handle.removeEventListener('pointermove', move)
      pin()
    }
    handle.addEventListener('pointermove', move)
    handle.addEventListener('pointerup', up, { once: true })
    handle.addEventListener('pointercancel', up, { once: true })
  }
  viewport()?.addEventListener('scroll', onScroll, { passive: true })
  root.addEventListener('keydown', onKey)
  root.addEventListener('pointerdown', onDown)
  const sizes = typeof win.ResizeObserver === 'function' ? new win.ResizeObserver(() => { o.onWidth?.(root.clientWidth); sync() }) : undefined
  sizes?.observe(root)
  hide(opts.hidden)
  sync()
  return {
    update(next: TableOptions) { o = next; hide(next.hidden); sync() },
    destroy() {
      viewport()?.removeEventListener('scroll', onScroll)
      root.removeEventListener('keydown', onKey)
      root.removeEventListener('pointerdown', onDown)
      sizes?.disconnect()
      if (!given) sheet.remove()
    },
  }
}
