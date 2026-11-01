import { MoreIcon } from '@weft/icons'
import { announce, findCard, installSweep, isSheet, kanban, menu, moveCard, moveLine, uid, type BoardCard, type BoardColumn } from '@weft/ui-core'
import { Box, derived, flush, onMount, state, untrack, type State } from 'weft'
import { Button } from '../Button'
import { Drawer } from '../Drawer'
import { Input } from '../Field'
import { use } from '../use'
import { SWEEP } from './peer'
import '../styles'
import '@weft/ui-core/styles/data/base.css'
import '@weft/ui-core/styles/data/kanban.css'
import '@weft/ui-core/styles/app/kanban.css'


export type KanbanCardData = BoardCard & { label?: string; color?: number; assignee?: string }
export type KanbanColumn = BoardColumn<KanbanCardData>

type Ctx = {
  board: () => KanbanColumn[]
  move: (id: string, col: number, index: number) => void
  sheet: (c: KanbanCardData) => void
  coarse: (el: Element) => boolean
  focus: (id: string) => void
  hint: string
}

function Card({ card, ctx }: { card: KanbanCardData; ctx: Ctx }) {
  const open = state(false)
  let btn: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined
  use(menu, () => panel, () => ({ open: open.value, trigger: () => btn, onClose: () => (open.value = false) }))
  const to = (col: number, index: number) => {
    const id = card.id
    open.value = false
    ctx.move(id, col, index)
    ctx.focus(id)
  }
  const at = () => findCard(ctx.board(), card.id)
  return (
    <li data-part="card" data-sweep="" data-phase="idle" tabindex="0" draggable="true" data-id={card.id} aria-label={card.title} aria-describedby={ctx.hint}>
      <SWEEP />
      <h4>{card.title}</h4>
      {(card.label !== undefined || card.assignee !== undefined) && (
        <footer>
          {card.label !== undefined && <span data-part="label-chip" style={`--_dc:var(--warp-color-data-${card.color ?? 1})`}><i></i>{card.label}</span>}
          {card.assignee !== undefined && <span data-scope="avatar" data-size="sm" aria-hidden="true">{card.assignee}</span>}
        </footer>
      )}
      <button ref={(n: any) => (btn = n)} type="button" data-part="move" aria-haspopup="true" aria-expanded={open.value ? 'true' : 'false'} aria-label={`Move ${card.title}`} onClick={(e: MouseEvent) => { if (ctx.coarse(e.currentTarget as Element)) ctx.sheet(card); else open.value = !open.value }}><MoreIcon /></button>
      <div ref={(n: any) => (panel = n)} data-part="menu" hidden={!open.value} role="menu" aria-label="Move to">
        {open.value && ctx.board().map(c => <button key={c.id} type="button" role="menuitem" tabindex="-1" aria-disabled={at()?.col === ctx.board().indexOf(c) ? 'true' : undefined} onClick={() => { const n = ctx.board().indexOf(c); if (at()?.col !== n) to(n, c.cards.length) }}>Move to {c.title}</button>)}
        {open.value && <button type="button" role="menuitem" tabindex="-1" onClick={() => { const a = at()!; to(a.col, a.index - 1) }}>Move up</button>}
        {open.value && <button type="button" role="menuitem" tabindex="-1" onClick={() => { const a = at()!; to(a.col, a.index + 1) }}>Move down</button>}
      </div>
    </li>
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

/**
 * The board (07 §6.2, 06 §10): columns are `section > ol`, with count and WIP limit, caution when over. Three move
 * paths: HTML drag with a placeholder; keyboard (Alt + arrows, or Space, arrows, Space); the Move button, a menu at a
 * fine pointer and a Sheet on a phone. Each move is announced. `columns` is a box or a plain list with `onMove`.
 */
export function Kanban({ columns, onMove, onAdd, label = 'Board' }: { columns: State<KanbanColumn[]> | KanbanColumn[]; onMove?: (id: string, column: string, index: number) => void; onAdd?: (column: string, title: string) => void; label?: string }) {
  const hint = uid('kanban')
  const own = state(untrack(() => (columns instanceof Box ? [] : columns)))
  const board = derived<KanbanColumn[]>(() => (columns instanceof Box ? columns.value : own.value))
  const adds = derived(() => onAdd !== undefined)
  const moving = state<KanbanCardData | null>(null)
  const sheetOpen = state(false)
  let host: HTMLDivElement | undefined
  onMount(() => installSweep())
  const focus = (id: string) => setTimeout(() => [...host!.querySelectorAll<HTMLElement>('[data-part="card"]')].find(c => c.dataset.id === id)?.focus())
  const move = (id: string, col: number, index: number) => {
    const next = moveCard(board.value, id, col, index)
    if (columns instanceof Box) columns.value = next
    else own.value = next
    flush()
    const at = findCard(next, id)!
    announce(host!.ownerDocument, moveLine(next, id))
    onMove?.(id, next[at.col].id, at.index)
  }
  use(kanban, () => host, () => ({ columns: () => untrack(() => board.value), onMove: move }))
  const ctx: Ctx = {
    board: () => board.value,
    move,
    focus,
    hint,
    coarse: el => isSheet(el) || !!el.ownerDocument.defaultView?.matchMedia?.('(pointer: coarse)').matches,
    sheet: c => { moving.value = c; sheetOpen.value = true },
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
      <div ref={(n: any) => (host = n)} data-scope="kanban" role="group" aria-label={label}>
        {board.value.map(c => (
          <section key={c.id} data-part="column" aria-labelledby={`${hint}-${c.id}`} data-over-limit={c.limit !== undefined && c.cards.length > c.limit ? '' : undefined}>
            <header data-part="column-head">
              {c.color !== undefined && <i style={`--_dc:var(--warp-color-data-${c.color})`}></i>}
              <h3 id={`${hint}-${c.id}`} style="margin-inline-end:auto">{c.title}</h3>
              <em data-part="count">{c.cards.length}{c.limit !== undefined ? ` / ${c.limit}` : ''}</em>
            </header>
            <ol aria-labelledby={`${hint}-${c.id}`}>
              {c.cards.map(card => <Card key={card.id} card={card} ctx={ctx} />)}
            </ol>
            {adds.value && <QuickAdd column={c} onAdd={t => onAdd!(c.id, t)} />}
          </section>
        ))}
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
