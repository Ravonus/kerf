// Board ordering and interaction.
import { installSweep } from './sweep'
import { announce } from './toast'

/** The least a kanban card needs. */
export interface BoardCard {
  id: string
  title: string
}
/** A kanban column and its cards. */
export interface BoardColumn<C extends BoardCard = BoardCard> {
  id: string
  title: string
  limit?: number | undefined
  color?: number
  cards: C[]
}
/** Where a card sits on the board. */
export type BoardSpot = { col: number; index: number }

/** Where card `id` is on the board, or null. */
export function findCard(columns: readonly BoardColumn<BoardCard>[], id: string): BoardSpot | null {
  for (let col = 0; col < columns.length; col++) {
    const index = columns[col]!.cards.findIndex((c) => c.id === id)
    if (index >= 0) return { col, index }
  }
  return null
}

/** The board with card `id` in column `col` at `index`, clamped. A new board; the card object is kept. */
export function moveCard<C extends BoardCard>(
  columns: readonly BoardColumn<C>[],
  id: string,
  col: number,
  index: number,
): BoardColumn<C>[] {
  const from = findCard(columns, id)
  if (!from || !columns[col]) return [...columns]
  const card = columns[from.col]!.cards[from.index]!
  return columns.map((c, i) => {
    const cards = c.cards.filter((x) => x.id !== id)
    if (i === col) cards.splice(Math.max(0, Math.min(index, cards.length)), 0, card)
    return i === from.col || i === col ? { ...c, cards } : c
  })
}

const STEP: Record<string, [number, number]> = {
  ArrowLeft: [-1, 0],
  ArrowRight: [1, 0],
  ArrowUp: [0, -1],
  ArrowDown: [0, 1],
}

/** Where an arrow key takes a card, or null at the edge of the board. Changing column keeps the row, clamped. */
export function stepCard(
  columns: readonly BoardColumn<BoardCard>[],
  id: string,
  key: string,
): BoardSpot | null {
  const at = findCard(columns, id),
    step = STEP[key]
  if (!at || !step) return null
  const col = at.col + step[0]
  if (!columns[col]) return null
  if (step[0]) return { col, index: Math.min(at.index, columns[col].cards.length) }
  const index = at.index + step[1]
  return index < 0 || index >= columns[col].cards.length ? null : { col, index }
}

/** "Moved X to Review, position 2 of 3" (06 §10). */
export function moveLine(columns: readonly BoardColumn<BoardCard>[], id: string) {
  const at = findCard(columns, id)
  if (!at) return ''
  const c = columns[at.col]!
  return `Moved ${c.cards[at.index]!.title} to ${c.title}, position ${at.index + 1} of ${c.cards.length}`
}

/** Options for a kanban board's drag, keyboard and announcements. */
export interface KanbanOptions {
  columns: () => readonly BoardColumn<BoardCard>[]
  /** Commit a move and render it before returning, so focus can follow the card. */
  onMove(id: string, col: number, index: number): void
  /** Render a card wherever it is in its column's window, and focus it. */
  focus(id: string): void
}

function boardDrag(
  host: HTMLElement,
  doc: Document,
  ph: HTMLElement,
  options: () => KanbanOptions,
  cardEl: (id: string) => HTMLElement | undefined,
) {
  let drag: HTMLElement | null = null
  const columnOf = (t: EventTarget | null) =>
    (t as Element).closest?.<HTMLElement>('[data-part="column"]')
  const onStart = (e: DragEvent) => {
    drag = (e.target as Element).closest?.<HTMLElement>('[data-part="card"]')
    if (!drag || !e.dataTransfer) return
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', drag.dataset.id!)
    const held = drag
    requestAnimationFrame(() => held.setAttribute('data-dragging', ''))
  }
  const onOver = (e: DragEvent) => {
    const col = columnOf(e.target)
    if (!col || !drag) return
    e.preventDefault()
    for (const c of host.querySelectorAll('[data-part="column"]'))
      c.toggleAttribute('data-drop', c === col)
    const ol = col.querySelector('ol')!
    const rows = [...ol.querySelectorAll<HTMLElement>('[data-part="row"]:not([data-probe])')]
      .filter((li) => !li.contains(drag))
      .sort(
        (a, b) => Number(a.getAttribute('aria-posinset')) - Number(b.getAttribute('aria-posinset')),
      )
    const after = rows.find((li) => {
      const r = li.getBoundingClientRect()
      return e.clientY < r.top + r.height / 2
    })
    const edge = after?.getBoundingClientRect().top ?? rows.at(-1)?.getBoundingClientRect().bottom
    const at = (edge ?? ol.getBoundingClientRect().top) - ol.getBoundingClientRect().top
    ph.style.cssText = `position:absolute;inset-inline:0;inset-block-start:0;transform:translateY(${after ? at - 6 : at + 2}px)`
    ph.dataset.before = after?.getAttribute('aria-posinset') ?? ''
    if (ph.parentElement !== ol) ol.append(ph)
  }
  const onDrop = (e: DragEvent) => {
    if (!drag || !ph.parentElement) return
    e.preventDefault()
    const ol = ph.parentElement
    const col = [...host.querySelectorAll('[data-part="column"]')].indexOf(
      ol.closest('[data-part="column"]')!,
    )
    const id = drag.dataset.id!
    const all = options().columns(),
      from = findCard(all, id)
    const before = ph.dataset.before ? Number(ph.dataset.before) - 1 : all[col]!.cards.length
    const index = from?.col === col && from.index < before ? before - 1 : before
    ph.remove()
    options().onMove(id, col, index)
    options().focus(id)
    requestAnimationFrame(() => {
      const landed = cardEl(id)
      if (landed) installSweep(doc).confirm(landed)
    })
  }
  const onEnd = () => {
    drag?.removeAttribute('data-dragging')
    drag = null
    ph.remove()
    for (const c of host.querySelectorAll('[data-part="column"]')) c.removeAttribute('data-drop')
  }
  return { onStart, onOver, onDrop, onEnd }
}

function boardCard(host: HTMLElement, id: string) {
  return [...host.querySelectorAll<HTMLElement>('[data-part="card"]')].find(
    (c) => c.dataset.id === id && !c.closest('[data-probe]'),
  )
}

/**
 * The board's two non-menu move paths (07 §6.2, 06 §10), over columns that are windows: a card's `li` is a window row,
 * positioned by the list. Pointer: HTML drag-and-drop with a 4px placeholder laid over the list and a data-drop column. Keyboard: Alt + arrows moves at once; Space picks up, arrows move, Space drops, Escape puts it back.
 * Every move is announced by the caller's onMove; focus stays on the card.
 */
export function kanban(host: HTMLElement, opts: KanbanOptions) {
  let o = opts
  const doc = host.ownerDocument
  let lifted: { id: string; home: BoardSpot } | null = null
  const ph = doc.createElement('li')
  ph.dataset.part = 'placeholder'
  ph.setAttribute('aria-hidden', 'true')
  const cardEl = (id: string) => boardCard(host, id)
  const lift = (on: boolean) => {
    if (lifted) cardEl(lifted.id)?.toggleAttribute('data-dragging', on)
  }
  const go = (id: string, col: number, index: number) => {
    o.onMove(id, col, index)
    o.focus(id)
    queueMicrotask(() => lift(true)) // the card renders in its new window first
  }
  const drop = () => {
    lift(false)
    lifted = null
  }
  const onKey = (e: KeyboardEvent) => {
    const card = e.target as HTMLElement
    if (card.dataset.part !== 'card') return
    const id = card.dataset.id!
    if (e.key === ' ' && !e.altKey) {
      e.preventDefault()
      const title = card.getAttribute('aria-label')
      if (lifted) {
        announce(doc, `Dropped ${title}`)
        return drop()
      }
      const home = findCard(o.columns(), id)
      if (!home) return
      lifted = { id, home }
      lift(true)
      return announce(
        doc,
        `Picked up ${title}. Arrow keys move it, Space drops it, Escape puts it back.`,
      )
    }
    if (e.key === 'Escape' && lifted) {
      e.preventDefault()
      const { id: was, home } = lifted
      go(was, home.col, home.index)
      return drop()
    }
    if (!STEP[e.key] || !(e.altKey || lifted)) return
    e.preventDefault()
    const to = stepCard(o.columns(), id, e.key)
    if (to) go(id, to.col, to.index)
  }
  const onBlur = (e: FocusEvent) => {
    if (
      lifted &&
      (e.target as HTMLElement).dataset?.id === lifted.id &&
      !host.contains(e.relatedTarget as Node)
    )
      drop()
  }
  const { onStart, onOver, onDrop, onEnd } = boardDrag(host, doc, ph, () => o, cardEl)
  host.addEventListener('keydown', onKey)
  host.addEventListener('focusout', onBlur)
  host.addEventListener('dragstart', onStart)
  host.addEventListener('dragover', onOver)
  host.addEventListener('drop', onDrop)
  host.addEventListener('dragend', onEnd)
  return {
    update(next: KanbanOptions) {
      o = next
    },
    destroy() {
      host.removeEventListener('keydown', onKey)
      host.removeEventListener('focusout', onBlur)
      host.removeEventListener('dragstart', onStart)
      host.removeEventListener('dragover', onOver)
      host.removeEventListener('drop', onDrop)
      host.removeEventListener('dragend', onEnd)
    },
  }
}
