import { MoreIcon } from '@kerf-js/veneer-icons'
import {
  announce,
  edges,
  findCard,
  isSheet,
  kanban,
  moveCard,
  moveLine,
  uid,
  type BoardCard,
  type BoardColumn,
} from '@kerf-js/veneer-core'
import { Box } from '@kerf-js/core/internal'
import { derived, flush, state, untrack, watch, type State } from '@kerf-js/core'
import { Button } from '../Button'
import { Drawer } from '../Drawer'
import { Input } from '../Field'
import { use } from '@kerf-js/veneer-core/kerf'
import { VirtualList, type VirtualControl } from '../VirtualList'
import { cardState, type Ctx } from './Kanban-card'
import { SWEEP } from './peer'
import '../styles'
import '@kerf-js/veneer-core/styles/data/base.css'
import '@kerf-js/veneer-core/styles/data/kanban.css'
import '@kerf-js/veneer-core/styles/app/kanban.css'
import '@kerf-js/veneer-core/styles/layout/edges.css'

/** A card on the board, with what Veneer draws on it. */
export type KanbanCardData = BoardCard & {
  label?: string | undefined
  color?: number | undefined
  assignee?: string | undefined
  /** Footer text: a due date, a count. */ meta?: string | undefined
}
/** A board column of Veneer cards. */
export type KanbanColumn = BoardColumn<KanbanCardData>

const hasFooter = (c: KanbanCardData) =>
  c.label !== undefined || c.assignee !== undefined || c.meta !== undefined

type CardProps = { card: KanbanCardData; ctx: Ctx }
type CardModel = ReturnType<typeof cardState>

function Card(props: CardProps) {
  const model = cardState(untrack(() => props))
  return cardView(
    untrack(() => props),
    model,
  )
}

function cardView(props: CardProps, [open, at, actions, refs]: CardModel) {
  return (
    <div
      ref={(n) => refs.element(n)}
      data-part="card"
      data-virtual=""
      data-focus=""
      data-sweep="surface"
      tabindex="0"
      draggable="true"
      data-id={props.card.id}
      aria-label={props.card.title}
      aria-describedby={props.ctx.hint}
    >
      <SWEEP />
      <h4 data-measure="">{props.card.title}</h4>
      {hasFooter(props.card) && (
        <footer>
          {props.card.meta}
          {props.card.label !== undefined && (
            <span
              data-part="label-chip"
              style={`--_dc:var(--veneer-color-data-${props.card.color ?? 1})`}
            >
              <i></i>
              {props.card.label}
            </span>
          )}
          {props.card.assignee !== undefined && (
            <span data-scope="avatar" data-size="sm" aria-hidden="true">
              {props.card.assignee}
            </span>
          )}
        </footer>
      )}
      <button
        ref={(n) => refs.button(n)}
        type="button"
        data-part="move"
        aria-haspopup="true"
        aria-expanded={open.value ? 'true' : 'false'}
        aria-label={`Move ${props.card.title}`}
        onClick={(e: MouseEvent) => actions.show(e)}
      >
        <MoreIcon />
      </button>
      <div
        ref={(n) => refs.menu(n)}
        data-part="menu"
        hidden={!open.value}
        role="menu"
        aria-label="Move to"
      >
        {open.value &&
          props.ctx.board().map((c) => (
            <button
              key={c.id}
              type="button"
              role="menuitem"
              tabindex="-1"
              aria-disabled={at()?.col === props.ctx.board().indexOf(c) ? 'true' : undefined}
              onClick={() => actions.choose(c)}
            >
              Move to {c.title}
            </button>
          ))}
        {open.value && (
          <button type="button" role="menuitem" tabindex="-1" onClick={() => actions.up()}>
            Move up
          </button>
        )}
        {open.value && (
          <button type="button" role="menuitem" tabindex="-1" onClick={() => actions.down()}>
            Move down
          </button>
        )}
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
      {adding.value ? (
        <form
          onSubmit={add}
          onKeyDown={(e: KeyboardEvent) => {
            if (e.key === 'Escape') adding.value = false
          }}
        >
          <Input label={`Add a card to ${column.title}`} size="sm" autofocus />
        </form>
      ) : (
        <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => (adding.value = true)}>
          Add card
        </Button>
      )}
    </>
  )
}

function Column({ col, ctx, hint }: { col: () => KanbanColumn; ctx: Ctx; hint: string }) {
  const id = untrack(() => col().id)
  return (
    <section
      data-part="column"
      aria-labelledby={`${hint}-${id}`}
      data-over-limit={
        col().limit !== undefined && col().cards.length > col().limit! ? '' : undefined
      }
    >
      <header data-part="column-head">
        {col().color !== undefined && <i style={`--_dc:var(--veneer-color-data-${col().color})`}></i>}
        <h3 id={`${hint}-${id}`} style="margin-inline-end:auto">
          {col().title}
        </h3>
        <em data-part="count">
          {col().cards.length}
          {col().limit !== undefined ? ` / ${col().limit}` : ''}
        </em>
      </header>
      <VirtualList
        part="cards"
        tag="ol"
        role="list"
        inner
        label={col().title}
        items={col().cards}
        rowKey={(c) => c.id}
        text={(c) => c.title}
        variant={(c) => (hasFooter(c) ? 'footer' : 'plain')}
        estimate={72}
        gap={8}
        onDrift={ctx.drift}
        control={(c) => ctx.window(id, c)}
      >
        {(card) => {
          const c = derived(card)
          return <Card card={c.value} ctx={ctx} />
        }}
      </VirtualList>
      {ctx.adds() && <QuickAdd column={col()} onAdd={(t) => ctx.add(id, t)} />}
    </section>
  )
}

type KanbanProps = {
  columns: State<KanbanColumn[]> | KanbanColumn[]
  onMove?: (id: string, column: string, index: number) => void
  onAdd?: (column: string, title: string) => void
  onDrift?: ((index: number, predicted: number, actual: number) => void) | undefined
  height?: string
  label?: string | undefined
}

type KanbanOptions = {
  columns: () => KanbanProps['columns']
  hasAdd: () => boolean
  onMove: (id: string, next: KanbanColumn[], at: NonNullable<ReturnType<typeof findCard>>) => void
  onAdd: (column: string, title: string) => void
  onDrift: (index: number, predicted: number, actual: number) => void
}

function kanbanState(opts: KanbanOptions) {
  const hint = uid('kanban')
  const own = state(
    untrack(() => (opts.columns() instanceof Box ? [] : (opts.columns() as KanbanColumn[]))),
  )
  const board = derived<KanbanColumn[]>(() =>
    opts.columns() instanceof Box ? (opts.columns() as State<KanbanColumn[]>).value : own.value,
  )
  watch(opts.columns, (c) => {
    if (!(c instanceof Box)) own.value = c as KanbanColumn[]
  })
  const adds = derived(() => opts.hasAdd())
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
    if (opts.columns() instanceof Box) (opts.columns() as State<KanbanColumn[]>).value = next
    else own.value = next
    flush()
    const at = findCard(next, id)!
    announce(host!.ownerDocument, moveLine(next, id))
    opts.onMove(id, next, at)
  }
  use(
    kanban,
    () => host,
    () => ({ columns: () => untrack(() => board.value), onMove: move, focus }),
  )
  use(edges, () => host) // a column cut at the stage's edge gets a shadow there, as a wide table's does
  const ctx: Ctx = {
    board: () => board.value,
    move,
    focus,
    hint,
    coarse: (el) =>
      isSheet(el) || !!el.ownerDocument.defaultView?.matchMedia?.('(pointer: coarse)').matches,
    sheet: (c) => {
      moving.value = c
      sheetOpen.value = true
    },
    drift: (i, p, a) => opts.onDrift(i, p, a),
    window: (column, c) => windows.set(column, c),
    adds: () => adds.value,
    add: (column, title) => opts.onAdd(column, title),
  }
  const sheetTo = (col: number, index: number) => {
    const id = moving.value!.id
    sheetOpen.value = false
    move(id, col, index)
    focus(id)
  }
  const place = derived(() => (moving.value ? findCard(board.value, moving.value.id) : null))
  return [
    hint,
    board,
    ctx,
    moving,
    sheetOpen,
    sheetTo,
    place,
    (n: HTMLDivElement) => (host = n),
  ] as const
}

/**
 * The board (07 §6.2, 06 §10). Columns are `section > ol`, each a window, so one with 10,000 cards costs what one with
 * 20 does, with count and WIP limit, caution when over. Three move paths: HTML drag with a placeholder; keyboard
 * (Alt + arrows, or Space, arrows, Space); the Move button, a menu at a fine pointer and a Sheet on a phone. Each move is
 * announced. `columns` is a box, or a list the board follows and `onMove` reports to. `height` defaults to 560px.
 */
export function Kanban({ columns, onMove, onAdd, onDrift, height, label = 'Board' }: KanbanProps) {
  const [hint, board, ctx, moving, sheetOpen, sheetTo, place, setHost] = kanbanState({
    columns: () => columns,
    hasAdd: () => onAdd !== undefined,
    onMove: (id, next, at) => onMove?.(id, next[at.col]!.id, at.index),
    onAdd: (column, title) => onAdd?.(column, title),
    onDrift: (index, predicted, actual) => onDrift?.(index, predicted, actual),
  })
  return (
    <>
      <div data-scope="edges">
        <div
          ref={(n) => setHost(n)}
          data-scope="kanban"
          role="group"
          aria-label={label}
          style={`block-size:${height ?? '560px'}`}
        >
          {board.value.map((c) => (
            <Column
              key={c.id}
              col={() => board.value.find((x) => x.id === c.id) ?? c}
              ctx={ctx}
              hint={hint}
            />
          ))}
        </div>
      </div>
      <p data-part="sr-only" id={hint}>
        Alt plus arrow keys move this card. Space picks it up. The move button lists every
        destination.
      </p>
      <Drawer open={sheetOpen} title={`Move ${moving.value?.title ?? ''}`} side="bottom">
        <div style="display:grid;gap:4px">
          {board.value.map((c) => (
            <Button
              key={c.id}
              emphasis="ghost"
              tone="neutral"
              full
              disabled={place.value !== null && board.value[place.value.col]?.id === c.id}
              onClick={() => sheetTo(board.value.indexOf(c), c.cards.length)}
            >
              Move to {c.title}
            </Button>
          ))}
          <Button
            emphasis="ghost"
            tone="neutral"
            full
            onClick={() => sheetTo(place.value!.col, place.value!.index - 1)}
          >
            Move up
          </Button>
          <Button
            emphasis="ghost"
            tone="neutral"
            full
            onClick={() => sheetTo(place.value!.col, place.value!.index + 1)}
          >
            Move down
          </Button>
        </div>
      </Drawer>
    </>
  )
}
