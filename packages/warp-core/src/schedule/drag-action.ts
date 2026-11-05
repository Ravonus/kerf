import type { CalendarDragOptions, DragPreview } from './drag'
import { DAY, type Slot } from './dates'
import { dragMove, dragResize, dragCreate, snapTo } from './movement'

type Drag = {
  mode: DragPreview['mode']
  pointer: number
  x0: number
  y0: number
  id?: string | undefined
  origin?: Slot | undefined
  date: string
  anchor: number
  resource?: string | undefined
  moved: boolean
  preview?: DragPreview
}

export class CalendarDragAction {
  el: HTMLElement
  delay: number
  o!: CalendarDragOptions
  doc!: Document
  drag!: Drag | null
  press!: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null
  swallow!: boolean
  on!: {
    pointerdown: (e: PointerEvent) => void
    pointermove: (e: PointerEvent) => void
    pointerup: () => void
    pointercancel: () => void
    click: (e: MouseEvent) => void
    dblclick: (e: MouseEvent) => void
    contextmenu: (e: Event) => void
  }
  constructor(el: HTMLElement, opts: CalendarDragOptions, delay: number) {
    this.el = el
    this.delay = delay
    this.o = opts
    this.doc = this.el.ownerDocument
    this.drag = null
    this.press = null
    this.swallow = false
    this.on = {
      pointerdown: this.onDown,
      pointermove: this.onMove,
      pointerup: this.onUp,
      pointercancel: this.onCancel,
      click: this.onClick,
      dblclick: this.onDouble,
      contextmenu: this.onMenu,
    } as const
    for (const [k, f] of Object.entries(this.on)) this.el.addEventListener(k, f as EventListener)
  }
  horizontal() {
    return this.o.axis === 'x'
  }
  cells() {
    return [
      ...this.el.querySelectorAll<HTMLElement>(
        this.horizontal() ? '[data-part="lane"]' : '[data-part="col"]',
      ),
    ]
  }
  span() {
    return (this.o.to ?? DAY) - (this.o.from ?? 0)
  }
  scale(cell: HTMLElement) {
    const r = cell.getBoundingClientRect()
    return (this.horizontal() ? r.width : r.height) / this.span() || 1
  }
  minuteAt(cell: HTMLElement, e: PointerEvent) {
    const r = cell.getBoundingClientRect()
    return (
      (this.o.from ?? 0) +
      (this.horizontal() ? e.clientX - r.left : e.clientY - r.top) / this.scale(cell)
    )
  }
  cellAt(e: PointerEvent) {
    return this.cells().find((c) => {
      const r = c.getBoundingClientRect()
      return this.horizontal()
        ? e.clientY >= r.top && e.clientY < r.bottom
        : e.clientX >= r.left && e.clientX < r.right
    })
  }
  cancelPress() {
    if (this.press) clearTimeout(this.press.timer)
    this.press = null
  }
  stop(commit: boolean) {
    const d = this.drag
    this.drag = null
    this.doc.removeEventListener('keydown', this.onKey, true)
    if (!d) return
    if (d.moved) {
      this.swallow = true
      setTimeout(() => (this.swallow = false))
      if (this.el.hasPointerCapture?.(d.pointer)) this.el.releasePointerCapture(d.pointer)
      this.o.onPreview(null)
      if (commit && d.preview) this.o.onDrop(d.preview)
    }
  }
  onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && this.drag?.moved) {
      e.preventDefault()
      e.stopPropagation()
      this.stop(false)
    }
  }
  onDown = (e: PointerEvent) => {
    if (e.button) return
    const target = e.target as Element
    const node = target.closest?.<HTMLElement>('[data-part="event"]')
    const cell = target.closest?.<HTMLElement>(
      this.horizontal() ? '[data-part="lane"]' : '[data-part="col"]',
    )
    if (!cell) return
    if (e.pointerType === 'touch') {
      if (node && this.o.onLongPress)
        this.press = {
          x: e.clientX,
          y: e.clientY,
          timer: setTimeout(() => {
            this.press = null
            this.swallow = true
            setTimeout(() => (this.swallow = false), 600)
            this.o.onLongPress!(node.dataset.id!, node)
          }, this.delay),
        }
      return
    }
    if (this.o.readOnly) return
    const date = cell.dataset.date ?? ''
    const resource = cell.dataset.resource
    if (node) {
      const slot = this.o.slot(node.dataset.id!)
      if (!slot) return
      e.preventDefault()
      this.drag = {
        mode: target.closest?.('[data-part="resize"]') ? 'resize' : 'move',
        pointer: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        id: node.dataset.id,
        origin: slot,
        date: slot.date,
        anchor: 0,
        resource,
        moved: false,
      }
    } else {
      e.preventDefault()
      this.drag = {
        mode: 'create',
        pointer: e.pointerId,
        x0: e.clientX,
        y0: e.clientY,
        date,
        anchor: this.minuteAt(cell, e),
        resource,
        moved: false,
      }
    }
    this.doc.addEventListener('keydown', this.onKey, true)
  }
  onMove = (e: PointerEvent) => {
    if (this.press && Math.hypot(e.clientX - this.press.x, e.clientY - this.press.y) > 6)
      this.cancelPress()
    const d = this.drag
    if (!d) return
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return
      d.moved = true
      this.el.setPointerCapture?.(d.pointer)
    }
    const step = e.altKey ? 5 : (this.o.step ?? 15)
    const cell = this.cellAt(e)
    const first = this.cells()[0]
    const dm =
      (this.horizontal() ? e.clientX - d.x0 : e.clientY - d.y0) / (first ? this.scale(first) : 1)
    let slot: Slot
    if (d.mode === 'move')
      slot = dragMove(
        d.origin!,
        dm,
        (!this.horizontal() && cell?.dataset.date) || d.date,
        step,
        this.horizontal() ? (cell?.dataset.resource ?? d.origin!.resource) : undefined,
      )
    else if (d.mode === 'resize') slot = dragResize(d.origin!, dm, step)
    else {
      const c = this.cells().find((x) =>
        this.horizontal() ? x.dataset.resource === d.resource : x.dataset.date === d.date,
      )
      slot = {
        ...dragCreate(d.date, d.anchor, c ? this.minuteAt(c, e) : d.anchor, step),
        resource: d.resource,
      }
    }
    d.preview = { ...slot, mode: d.mode, id: d.id, origin: d.origin }
    this.o.onPreview(d.preview)
  }
  onUp = () => {
    this.cancelPress()
    this.stop(true)
  }
  onCancel = () => {
    this.cancelPress()
    this.stop(false)
  }
  onClick = (e: MouseEvent) => {
    if (this.swallow) {
      this.swallow = false
      e.preventDefault()
      e.stopPropagation()
      return
    }
    const node = (e.target as Element).closest?.<HTMLElement>('[data-part="event"]')
    if (node) this.o.onPress(node.dataset.id!, node)
  }
  onDouble = (e: MouseEvent) => {
    const t = e.target as Element
    if (this.o.readOnly || t.closest?.('[data-part="event"]')) return
    const cell = t.closest?.<HTMLElement>(
      this.horizontal() ? '[data-part="lane"]' : '[data-part="col"]',
    )
    if (cell)
      this.o.onSlot?.(
        cell.dataset.date ?? '',
        snapTo(this.minuteAt(cell, e as PointerEvent), this.o.step ?? 15),
        cell.dataset.resource,
      )
  }
  onMenu = (e: Event) => {
    if (this.press) e.preventDefault()
  }
  update = (next: CalendarDragOptions) => {
    this.o = next
  }
  destroy = () => {
    this.cancelPress()
    this.doc.removeEventListener('keydown', this.onKey, true)
    for (const [k, f] of Object.entries(this.on)) this.el.removeEventListener(k, f as EventListener)
  }
}
