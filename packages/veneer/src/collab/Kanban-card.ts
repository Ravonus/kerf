import { findCard, menu } from '@kerf/veneer-core'
import { state, watch } from '@kerf/core'
import { use } from '@kerf/veneer-core/kerf'
import type { VirtualControl } from '../VirtualList'
import type { KanbanCardData, KanbanColumn } from './Kanban'

/** The board services shared with a card and its column. */
export type Ctx = {
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

/** Keep a card’s menu state and its move handlers together. */
export function cardState(props: { readonly card: KanbanCardData; readonly ctx: Ctx }) {
  const card = () => props.card
  const ctx = () => props.ctx
  const open = state(false)
  let btn: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined
  let el: HTMLDivElement | undefined
  use(
    menu,
    () => panel,
    () => ({ open: open.value, trigger: () => btn, onClose: () => (open.value = false) }),
  )
  watch(
    () => open.value,
    (on) => {
      const row = el?.parentElement
      if (row) row.style.zIndex = on ? '5' : ''
    },
  ) // a row is its own stacking context, so the menu's has to rise
  const to = (col: number, index: number) => {
    const id = card().id
    open.value = false
    ctx().move(id, col, index)
    ctx().focus(id)
  }
  const at = () => findCard(ctx().board(), card().id)
  const choose = (c: KanbanColumn) => {
    const n = ctx().board().indexOf(c)
    if (at()?.col !== n) to(n, c.cards.length)
  }
  const up = () => {
    const a = at()!
    to(a.col, a.index - 1)
  }
  const down = () => {
    const a = at()!
    to(a.col, a.index + 1)
  }
  const show = (e: MouseEvent) => {
    if (ctx().coarse(e.currentTarget as Element)) ctx().sheet(card())
    else open.value = !open.value
  }
  return [
    open,
    at,
    { choose, up, down, show },
    {
      button: (n: HTMLButtonElement) => (btn = n),
      menu: (n: HTMLDivElement) => (panel = n),
      element: (n: HTMLDivElement) => (el = n),
    },
  ] as const
}
