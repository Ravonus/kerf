import type { GridOptions } from '../grid'
import { toTSV, parseTSV } from './data'

type At = [row: number, col: number]
const PAGE = 5 // PageUp/PageDown, in rows (06 §6)

export class GridAction {
  root: HTMLElement
  o!: GridOptions
  doc!: Document
  // col -1 is the row itself, in a treegrid
  at!: At
  anchor!: At | undefined
  current!: HTMLElement | undefined
  dragged!: string | undefined
  on!: [string, (e: never) => void][]
  constructor(root: HTMLElement, opts: GridOptions) {
    this.root = root
    this.o = opts
    this.doc = this.root.ownerDocument
    this.at = [0, this.o.tree ? -1 : 0]
    this.on = [
      ['keydown', this.onKey],
      ['click', this.place],
      ['dblclick', this.onDouble],
      ['paste', this.onPaste],
      ['dragstart', this.onDragStart],
      ['dragover', this.onDragOver],
      ['drop', this.onDrop],
      ['dragend', this.onDragEnd],
    ]
    for (const [type, fn] of this.on) this.root.addEventListener(type, fn as EventListener)
    this.settle()
  }
  rows() {
    return [...this.root.querySelectorAll<HTMLElement>('tbody > tr[data-row]')]
  }
  cells(tr?: HTMLElement) {
    return tr ? ([...tr.children] as HTMLElement[]) : []
  }
  target(p: At) {
    const tr = this.rows()[p[0]]
    return p[1] < 0 ? tr : this.cells(tr)[Math.min(p[1], this.cells(tr).length - 1)]
  }
  settle() {
    const r = this.rows()
    this.at = [
      Math.max(0, Math.min(this.at[0], r.length - 1)),
      this.at[1] < 0 && !this.o.tree ? 0 : this.at[1],
    ]
    const el = this.target(this.at)
    if (this.current !== el) {
      if (this.current) this.current.tabIndex = -1
    }
    if (el) el.tabIndex = 0
    this.current = el
    return el
  }
  selected() {
    return [...this.root.querySelectorAll<HTMLElement>('tbody [aria-selected="true"]')]
  }
  paint(a?: At, b?: At) {
    for (const c of this.selected()) c.removeAttribute('aria-selected')
    const touched = new Set<string>()
    if (a && b) {
      const all = this.rows()
      for (let r = Math.min(a[0], b[0]); r <= Math.max(a[0], b[0]); r++)
        for (let c = Math.min(a[1], b[1]); c <= Math.max(a[1], b[1]); c++) {
          const cell = this.cells(all[r])[c]
          if (!cell) continue
          cell.setAttribute('aria-selected', 'true')
          touched.add(all[r]!.dataset.row!)
        }
    }
    this.o.onSelect?.([...touched])
  }
  go(p: At, extend = false) {
    if (extend && p[1] >= 0 && this.at[1] >= 0) {
      this.anchor ??= this.at
      this.paint(this.anchor, p)
    } else {
      this.anchor = p[1] >= 0 ? p : undefined
      this.paint()
    }
    this.at = p
    this.settle()?.focus()
  }
  async copy() {
    const picked = this.selected()
    const lines = new Map<Element, string[]>()
    for (const c of picked.length
      ? picked
      : ([this.target(this.at)].filter(Boolean) as Element[])) {
      const line = lines.get(c.parentElement!) ?? []
      line.push(c.textContent.trim())
      lines.set(c.parentElement!, line)
    }
    const table = [...lines.values()]
    if (!table.length) return
    await this.doc.defaultView!.navigator.clipboard?.writeText(toTSV(table)).catch(() => {})
    for (const c of picked) {
      c.removeAttribute('data-copied')
      void c.offsetWidth
      c.setAttribute('data-copied', '')
    }
    this.o.onStatus?.(`Copied ${table.length} × ${table[0]!.length} cells`)
  }
  parentOf(i: number, all: HTMLElement[]) {
    const level = +all[i]!.getAttribute('aria-level')!
    for (let j = i - 1; j >= 0; j--) if (+all[j]!.getAttribute('aria-level')! < level) return j
    return -1
  }
  onKey = (e: KeyboardEvent) => {
    const el = e.target as HTMLElement
    const head = el.closest?.('thead th[data-col]') as HTMLElement | null
    if (head && e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
      e.preventDefault()
      const heads = [
        ...this.root.querySelectorAll<HTMLElement>('thead tr:first-child th[data-col]'),
      ]
      const rtl = getComputedStyle(this.root).direction === 'rtl'
      const by = (e.key === 'ArrowRight') !== rtl ? 1 : -1
      const to = Math.max(0, Math.min(heads.length - 1, heads.indexOf(head) + by))
      this.o.onReorder?.(head.dataset.col!, to)
      return
    }
    if (el.closest?.('input, select, textarea, [contenteditable]') || !el.closest?.('tbody')) return
    const all = this.rows()
    const k = e.key
    const mod = e.ctrlKey || e.metaKey
    if (mod && k.toLowerCase() === 'c') {
      e.preventDefault()
      void this.copy()
      return
    }
    this.navigateKey(e, all, k, mod)
  }
  navigateKey(e: KeyboardEvent, all: HTMLElement[], k: string, mod: boolean) {
    const rtl = getComputedStyle(this.root).direction === 'rtl'
    const forward = rtl ? 'ArrowLeft' : 'ArrowRight'
    const back = rtl ? 'ArrowRight' : 'ArrowLeft'
    const [r, c] = this.at
    const tr = all[r]
    if (!tr) return
    const expanded = tr.getAttribute('aria-expanded')
    const onRow = c < 0
    const last = this.cells(tr).length - 1
    if (k === 'Enter' || k === 'F2' || (k === ' ' && !e.shiftKey)) {
      const cell = onRow ? undefined : this.cells(tr)[c]
      if (k !== ' ' && cell?.hasAttribute('data-editable')) {
        e.preventDefault()
        this.o.onEdit?.(cell)
        return
      }
      if (k === 'F2') return
      if (expanded !== null && (onRow || c === 0)) {
        e.preventDefault()
        this.o.onToggle?.(tr, expanded !== 'true')
        return
      }
      const button = cell?.querySelector<HTMLElement>('button, a[href]')
      if (button) {
        e.preventDefault()
        button.click()
      }
      return
    }
    if (this.o.tree && onRow && k === forward) {
      e.preventDefault()
      if (expanded === 'false') this.o.onToggle?.(tr, true)
      else this.go([r, 0])
      return
    }
    if (this.o.tree && k === back && (onRow || c === 0)) {
      e.preventDefault()
      if (!onRow) this.go([r, -1])
      else if (expanded === 'true') this.o.onToggle?.(tr, false)
      else {
        const p = this.parentOf(r, all)
        if (p >= 0) this.go([p, -1])
      }
      return
    }
    let next: At | undefined
    const clampRow = (v: number) => Math.max(0, Math.min(all.length - 1, v))
    const clampCol = (row: number, v: number) =>
      onRow ? -1 : Math.max(0, Math.min(this.cells(all[row]).length - 1, v))
    if (k === 'ArrowDown' || k === 'ArrowUp' || k === 'PageDown' || k === 'PageUp') {
      const by = { ArrowDown: 1, ArrowUp: -1, PageDown: PAGE, PageUp: -PAGE }[k]
      const row = clampRow(r + by)
      next = [row, clampCol(row, c)]
    } else if (k === forward || k === back)
      next = onRow ? undefined : [r, clampCol(r, c + (k === forward ? 1 : -1))]
    else if (k === 'Home') next = mod ? [0, onRow ? -1 : 0] : onRow ? [0, -1] : [r, 0]
    else if (k === 'End') {
      const row = all.length - 1
      next = mod
        ? [row, onRow ? -1 : this.cells(all[row]).length - 1]
        : onRow
          ? [row, -1]
          : [r, last]
    } else if (k === 'Escape') {
      if (this.selected().length) {
        e.preventDefault()
        this.anchor = undefined
        this.paint()
      }
      return
    }
    if (!next) return
    e.preventDefault()
    this.go(next, e.shiftKey)
  }
  place = (e: Event) => {
    const el = e.target as HTMLElement
    if (el.closest?.('input, select, textarea, button, a, label')) return
    const cell = el.closest?.<HTMLElement>('tbody td, tbody th')
    const tr = cell?.parentElement as HTMLElement | undefined
    if (!cell || !tr?.dataset.row) return
    this.go([this.rows().indexOf(tr), this.cells(tr).indexOf(cell)], (e as MouseEvent).shiftKey)
  }
  onDouble = (e: MouseEvent) => {
    const el = e.target as HTMLElement
    const cell = el.closest?.<HTMLElement>('tbody td, tbody th')
    if (!cell || el.closest?.('input, button')) return
    if (cell.hasAttribute('data-editable')) this.o.onEdit?.(cell)
    else {
      const tr = cell.parentElement!,
        open = tr.getAttribute('aria-expanded')
      if (open !== null) this.o.onToggle?.(tr, open !== 'true')
    }
  }
  onPaste = (e: ClipboardEvent) => {
    if (!this.o.onPaste || (e.target as HTMLElement).closest?.('input, select, textarea')) return
    const cell = this.target(this.at)
    const text = e.clipboardData?.getData('text/plain')
    if (!cell || !text || this.at[1] < 0) return
    e.preventDefault()
    this.o.onPaste(cell, parseTSV(text))
  }
  heads() {
    return this.root.querySelectorAll<HTMLElement>('thead th[data-col]')
  }
  clearDrop() {
    for (const h of this.heads()) {
      h.removeAttribute('data-drop-before')
      h.removeAttribute('data-drop-after')
    }
  }
  // the header's drag: the keyboard path is Alt + arrows above
  onDragStart = (e: DragEvent) => {
    const th = (e.target as HTMLElement).closest?.<HTMLElement>('thead th[data-col]')
    if (!th) return
    this.dragged = th.dataset.col
    e.dataTransfer!.effectAllowed = 'move'
    e.dataTransfer!.setData('text/plain', this.dragged!)
  }
  onDragOver = (e: DragEvent) => {
    const th = (e.target as HTMLElement).closest?.<HTMLElement>('thead th[data-col]')
    if (!th || !this.dragged) return
    e.preventDefault()
    const box = th.getBoundingClientRect()
    this.clearDrop()
    th.toggleAttribute(
      e.clientX > box.left + box.width / 2 ? 'data-drop-after' : 'data-drop-before',
      true,
    )
  }
  onDrop = (e: DragEvent) => {
    const th = (e.target as HTMLElement).closest?.<HTMLElement>('thead th[data-col]')
    if (!th || !this.dragged || th.dataset.col === this.dragged) return
    e.preventDefault()
    const order = [...this.root.querySelectorAll<HTMLElement>('thead tr:first-child th[data-col]')]
      .map((h) => h.dataset.col!)
      .filter((c) => c !== this.dragged)
    this.o.onReorder?.(
      this.dragged,
      order.indexOf(th.dataset.col!) + (th.hasAttribute('data-drop-after') ? 1 : 0),
    )
  }
  onDragEnd = () => {
    this.dragged = undefined
    this.clearDrop()
  }
  update = (next: GridOptions) => {
    const changed = next.rows !== this.o.rows
    this.o = next
    if (!changed) return
    this.anchor = undefined
    if (this.selected().length) this.paint()
    // the row that held focus may have moved: find it again, so the tab stop stays on it
    const live = this.current?.isConnected ? this.current : undefined
    if (live) {
      const tr = live.closest<HTMLElement>('tr[data-row]') ?? live
      this.at = [this.rows().indexOf(tr), tr === live ? -1 : this.cells(tr).indexOf(live)]
    }
    this.settle()
  }
  refocus = () => {
    this.settle()?.focus()
  }
  destroy = () => {
    for (const [type, fn] of this.on) this.root.removeEventListener(type, fn as EventListener)
  }
}
