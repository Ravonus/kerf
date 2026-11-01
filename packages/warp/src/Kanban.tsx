import { MoreIcon } from '@weft/icons'
import { derived, onMount, state, untrack } from 'weft'
import { announce, installSweep } from '@weft/ui-core'
import { VirtualList, type VirtualControl } from './VirtualList'
import './styles'
import '@weft/ui-core/styles/data/kanban.css'

export interface KanbanCard {
  id: string
  title: string
  /** Footer text: owner, due date. */
  meta?: string
}
export interface KanbanColumn<T extends KanbanCard = KanbanCard> {
  id: string
  title: string
  cards: readonly T[]
  /** Past this many cards the count turns to a caution. */
  limit?: number
}
export interface KanbanProps<T extends KanbanCard> {
  columns: readonly KanbanColumn<T>[]
  label: string
  /** Default `560px`. */
  height?: string
  /** The app moves the card in its data; the board follows. */
  onMove: (card: T, to: string, index: number) => void
  onDrift?: (index: number, predicted: number, actual: number) => void
}

/** A board (06 §10) whose columns are windows, so one with 10,000 cards costs what one with 20 does. */
export function Kanban<T extends KanbanCard>(props: KanbanProps<T>) {
  onMount(() => installSweep())
  const controls = new Map<string, VirtualControl>()
  const dragging = state<{ card: T; from: string } | null>(null)
  const over = state<string | null>(null)
  const menu = state<string | null>(null)
  const columns = derived(() => props.columns)
  const place = (id: string) => {
    const all = columns.value
    for (let c = 0; c < all.length; c++) { const i = all[c].cards.findIndex(x => x.id === id); if (i >= 0) return { c, i } }
    return null
  }

  function move(card: T, c: number, i: number) {
    const col = columns.value[c]
    if (!col) return
    const index = Math.max(0, Math.min(i, col.cards.filter(x => x.id !== card.id).length))
    props.onMove(card, col.id, index)
    menu.value = null
    announce(document, `Moved ${card.title} to ${col.title}, position ${index + 1} of ${col.cards.length + (col.cards.includes(card) ? 0 : 1)}`)
    queueMicrotask(() => controls.get(col.id)?.focus(card.id)) // focus follows the card
  }

  const keys = (card: () => T) => (e: KeyboardEvent) => {
    if (!e.altKey || !e.key.startsWith('Arrow')) return
    e.preventDefault()
    const at = place(card().id)
    if (!at) return
    if (e.key === 'ArrowLeft') move(card(), at.c - 1, at.i)
    if (e.key === 'ArrowRight') move(card(), at.c + 1, at.i)
    if (e.key === 'ArrowUp') move(card(), at.c, at.i - 1)
    if (e.key === 'ArrowDown') move(card(), at.c, at.i + 1)
  }

  const Card = (p: { card: () => T }) => {
    const id = untrack(() => p.card().id)
    const open = () => menu.value === id
    const at = () => place(id)
    return (
      <div
        data-part="card" data-virtual="" data-focus="" tabindex="0" data-sweep="" data-phase="idle" data-dragging={dragging.value?.card.id === id ? '' : undefined} draggable="true"
        style={open() ? 'z-index:5' : undefined} onKeyDown={keys(p.card)}
        onDragStart={(e: DragEvent) => { dragging.value = { card: p.card(), from: columns.value[at()!.c].id }; e.dataTransfer?.setData('text/plain', id) }}
        onDragEnd={() => { dragging.value = null; over.value = null }}
      >
        <h4 data-measure="">{p.card().title}</h4>
        <button type="button" data-part="move" aria-label={`Move ${p.card().title}`} aria-haspopup="menu" aria-expanded={open() ? 'true' : 'false'} onClick={() => (menu.value = open() ? null : id)}><MoreIcon /></button>
        <div data-part="menu" role="menu" hidden={!open()}>
          {open() && columns.value.map((c, i) => <button key={c.id} type="button" role="menuitem" aria-disabled={at()?.c === i ? 'true' : undefined} onClick={() => { if (at()?.c !== i) move(p.card(), i, 0) }}>{c.title}</button>)}
          {open() && <button type="button" role="menuitem" onClick={() => move(p.card(), at()!.c, at()!.i - 1)}>Move up</button>}
          {open() && <button type="button" role="menuitem" onClick={() => move(p.card(), at()!.c, at()!.i + 1)}>Move down</button>}
        </div>
        {p.card().meta && <footer>{p.card().meta}</footer>}
        <span data-part="sweep" aria-hidden="true"></span>
      </div>
    )
  }

  const Column = (p: { col: () => KanbanColumn<T> }) => {
    const id = untrack(() => p.col().id)
    const full = () => { const c = p.col(); return c.limit != null && c.cards.length > c.limit }
    return (
      <section
        data-part="column" aria-label={p.col().title} data-drop={over.value === id ? '' : undefined}
        onDragOver={(e: DragEvent) => { e.preventDefault(); over.value = id }}
        onDragLeave={(e: DragEvent) => { if (!(e.currentTarget as Node).contains(e.relatedTarget as Node)) over.value = null }}
        onDrop={(e: DragEvent) => {
          e.preventDefault()
          const d = dragging.value, c = columns.value.findIndex(x => x.id === id)
          over.value = null
          if (d) move(d.card, c, columns.value[c].cards.length)
        }}
      >
        <header data-part="column-head"><h3>{p.col().title}</h3><span data-part="count" data-over={full() ? '' : undefined}>{p.col().cards.length}{p.col().limit != null ? ` / ${p.col().limit}` : ''}</span></header>
        <VirtualList
          part="cards"
          tag="ol"
          role="list"
          inner
          label={`${p.col().title} cards`}
          items={p.col().cards}
          rowKey={c => c.id}
          text={c => c.title}
          variant={c => (c.meta ? 'meta' : 'plain')}
          estimate={72}
          gap={8}
          onDrift={props.onDrift}
          control={c => controls.set(id, c)}
        >{card => <Card card={card} />}</VirtualList>
      </section>
    )
  }

  return (
    <div data-scope="kanban" role="group" aria-label={props.label} style={`block-size:${props.height ?? '560px'}`}>
      {columns.value.map(c => <Column key={c.id} col={() => columns.value.find(x => x.id === c.id) ?? c} />)}
    </div>
  )
}
