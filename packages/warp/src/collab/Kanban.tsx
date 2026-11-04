import { MoreIcon } from '@weft-js/warp-icons'
import { announce, edges, findCard, isSheet, kanban, menu, moveCard, moveLine, uid, type BoardCard, type BoardColumn } from '@weft-js/warp-core'
import { Box, derived, flush, state, untrack, watch, type State } from '@weft-js/core'
import { Button } from '../Button'
import { Drawer } from '../Drawer'
import { Input } from '../Field'
import { use } from '@weft-js/warp-core/weft'
import { VirtualList, type VirtualControl } from '../VirtualList'
import { SWEEP } from './peer'
import '../styles'
import '@weft-js/warp-core/styles/data/base.css'
import '@weft-js/warp-core/styles/data/kanban.css'
import '@weft-js/warp-core/styles/app/kanban.css'
import '@weft-js/warp-core/styles/layout/edges.css'


/** A card on the board, with what warp draws on it. */
export type KanbanCardData = BoardCard & { label?: string | undefined; color?: number | undefined; assignee?: string | undefined; /** Footer text: a due date, a count. */ meta?: string | undefined }
/** A board column of warp cards. */
export type KanbanColumn = BoardColumn<KanbanCardData>

type Ctx = {
  board: () => KanbanColumn[]
  move: (id: string, col: number, index: number) => void
  sheet: (c: KanbanCardData) => void
  coarse: (el: Element) => boolean
  focus: (id: string) => void
  hint: string
  drift?: (index: number, predicted: number, actual: number) => void
  window: (column: string, c: VirtualControl) => void
  adds: () => boolean
  add: (column: string, title: string) => void
}

const hasFooter = (c: KanbanCardData) => c.label !== undefined || c.assignee !== undefined || c.meta !== undefined

function Card({ card, ctx }: { card: KanbanCardData; ctx: Ctx }) {
  const open = state(false)
  let btn: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined
  let el: HTMLDivElement | undefined
  use(menu, () => panel, () => ({ open: open.value, trigger: () => btn, onClose: () => (open.value = false) }))
  watch(() => open.value, on => { const row = el?.parentElement; if (row) row.style.zIndex = on ? '5' : '' }) // a row is its own stacking context, so the menu's has to rise
  const to = (col: number, index: number) => {
    const id = card.id
    open.value = false
    ctx.move(id, col, index)
    ctx.focus(id)
  }
  const at = () => findCard(ctx.board(), card.id)
  return (
    <div ref={n => (el = n)} data-part="card" data-virtual="" data-focus="" data-sweep="surface" tabindex="0" draggable="true" data-id={card.id} aria-label={card.title} aria-describedby={ctx.hint}>
      <SWEEP />
      <h4 data-measure="">{card.title}</h4>
      {hasFooter(card) && (
        <footer>
          {card.meta}
          {card.label !== undefined && <span data-part="label-chip" style={`--_dc:var(--warp-color-data-${card.color ?? 1})`}><i></i>{card.label}</span>}
          {card.assignee !== undefined && <span data-scope="avatar" data-size="sm" aria-hidden="true">{card.assignee}</span>}
        </footer>
      )}
      <button ref={n => (btn = n)} type="button" data-part="move" aria-haspopup="true" aria-expanded={open.value ? 'true' : 'false'} aria-label={`Move ${card.title}`} onClick={(e: MouseEvent) => { if (ctx.coarse(e.currentTarget as Element)) ctx.sheet(card); else open.value = !open.value }}><MoreIcon /></button>
      <div ref={n => (panel = n)} data-part="menu" hidden={!open.value} role="menu" aria-label="Move to">
        {open.value && ctx.board().map(c => <button key={c.id} type="button" role="menuitem" tabindex="-1" aria-disabled={at()?.col === ctx.board().indexOf(c) ? 'true' : undefined} onClick={() => { const n = ctx.board().indexOf(c); if (at()?.col !== n) to(n, c.cards.length) }}>Move to {c.title}</button>)}
        {open.value && <button type="button" role="menuitem" tabindex="-1" onClick={() => { const a = at()!; to(a.col, a.index - 1) }}>Move up</button>}
        {open.value && <button type="button" role="menuitem" tabindex="-1" onClick={() => { const a = at()!; to(a.col, a.index + 1) }}>Move down</button>}
      </div>
    </div>
  )
}

function QuickAdd({ column, onAdd }: { column: KanbanColumn; onAdd: (title: string) => void }) {
  const adding = state(false)
  const add = (e: Event) => {
    e.preventDefault()
    const el = (e.currentTarget as HTMLFormElement).querySelector('input')!
    if (el.value.trim()) onAdd(el.value.trim())
    el.value = ''
  }
  return (
    <>
      {adding.value
        ? <form onSubmit={add} onKeyDown={(e: KeyboardEvent) => { if (e.key === 'Escape') adding.value = false }}><Input label={`Add a card to ${column.title}`} size="sm" autofocus /></form>
        : <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => (adding.value = true)}>Add card</Button>}
    </>
  )
}

function Column({ col, ctx, hint }: { col: () => KanbanColumn; ctx: Ctx; hint: string }) {
  const id = untrack(() => col().id)
  return (
    <section data-part="column" aria-labelledby={`${hint}-${id}`} data-over-limit={col().limit !== undefined && col().cards.length > col().limit! ? '' : undefined}>
      <header data-part="column-head">
        {col().color !== undefined && <i style={`--_dc:var(--warp-color-data-${col().color})`}></i>}
        <h3 id={`${hint}-${id}`} style="margin-inline-end:auto">{col().title}</h3>
        <em data-part="count">{col().cards.length}{col().limit !== undefined ? ` / ${col().limit}` : ''}</em>
      </header>
      <VirtualList
        part="cards"
        tag="ol"
        role="list"
        inner
        label={col().title}
        items={col().cards}
        rowKey={c => c.id}
        text={c => c.title}
        variant={c => (hasFooter(c) ? 'footer' : 'plain')}
        estimate={72}
        gap={8}
        onDrift={ctx.drift}
        control={c => ctx.window(id, c)}
      >{card => { const c = derived(card); return <Card card={c.value} ctx={ctx} /> }}</VirtualList>
      {ctx.adds() && <QuickAdd column={col()} onAdd={t => ctx.add(id, t)} />}
    </section>
  )
}

/**
 * The board (07 §6.2, 06 §10). Columns are `section > ol`, each a window, so one with 10,000 cards costs what one with
 * 20 does, with count and WIP limit, caution when over. Three move paths: HTML drag with a placeholder; keyboard
 * (Alt + arrows, or Space, arrows, Space); the Move button, a menu at a fine pointer and a Sheet on a phone. Each move is
 * announced. `columns` is a box, or a list the board follows and `onMove` reports to. `height` defaults to 560px.
 */
export function Kanban({ columns, onMove, onAdd, onDrift, height, label = 'Board' }: { columns: State<KanbanColumn[]> | KanbanColumn[]; onMove?: (id: string, column: string, index: number) => void; onAdd?: (column: string, title: string) => void; onDrift?: ((index: number, predicted: number, actual: number) => void) | undefined; height?: string; label?: string | undefined }) {
  const hint = uid('kanban')
  const own = state(untrack(() => (columns instanceof Box ? [] : columns)))
  const board = derived<KanbanColumn[]>(() => (columns instanceof Box ? columns.value : own.value))
  watch(() => columns, c => { if (!(c instanceof Box)) own.value = c })
  const adds = derived(() => onAdd !== undefined)
  const moving = state<KanbanCardData | null>(null)
  const sheetOpen = state(false)
  const windows = new Map<string, VirtualControl>()
  let host: HTMLDivElement | undefined
  const focus = (id: string) => {
    const at = findCard(board.value, id)
    if (at) queueMicrotask(() => windows.get(board.value[at.col]!.id)?.focus(id)) // focus follows the card
  }
  const move = (id: string, col: number, index: number) => {
    const next = moveCard(board.value, id, col, index)
    if (columns instanceof Box) columns.value = next
    else own.value = next
    flush()
    const at = findCard(next, id)!
    announce(host!.ownerDocument, moveLine(next, id))
    onMove?.(id, next[at.col]!.id, at.index)
  }
  use(kanban, () => host, () => ({ columns: () => untrack(() => board.value), onMove: move, focus }))
  use(edges, () => host) // a column cut at the stage's edge gets a shadow there, as a wide table's does
  const ctx: Ctx = {
    board: () => board.value,
    move,
    focus,
    hint,
    coarse: el => isSheet(el) || !!el.ownerDocument.defaultView?.matchMedia?.('(pointer: coarse)').matches,
    sheet: c => { moving.value = c; sheetOpen.value = true },
    drift: (i, p, a) => onDrift?.(i, p, a),
    window: (column, c) => windows.set(column, c),
    adds: () => adds.value,
    add: (column, title) => onAdd?.(column, title),
  }
  const sheetTo = (col: number, index: number) => {
    const id = moving.value!.id
    sheetOpen.value = false
    move(id, col, index)
    focus(id)
  }
  const place = derived(() => (moving.value ? findCard(board.value, moving.value.id) : null))
  return (
    <>
      <div data-scope="edges">
        <div ref={n => (host = n)} data-scope="kanban" role="group" aria-label={label} style={`block-size:${height ?? '560px'}`}>
          {board.value.map(c => <Column key={c.id} col={() => board.value.find(x => x.id === c.id) ?? c} ctx={ctx} hint={hint} />)}
        </div>
      </div>
      <p data-part="sr-only" id={hint}>Alt plus arrow keys move this card. Space picks it up. The move button lists every destination.</p>
      <Drawer open={sheetOpen} title={`Move ${moving.value?.title ?? ''}`} side="bottom">
        <div style="display:grid;gap:4px">
          {board.value.map(c => <Button key={c.id} emphasis="ghost" tone="neutral" full disabled={place.value !== null && board.value[place.value.col]?.id === c.id} onClick={() => sheetTo(board.value.indexOf(c), c.cards.length)}>Move to {c.title}</Button>)}
          <Button emphasis="ghost" tone="neutral" full onClick={() => sheetTo(place.value!.col, place.value!.index - 1)}>Move up</Button>
          <Button emphasis="ghost" tone="neutral" full onClick={() => sheetTo(place.value!.col, place.value!.index + 1)}>Move down</Button>
        </div>
      </Drawer>
    </>
  )
}
