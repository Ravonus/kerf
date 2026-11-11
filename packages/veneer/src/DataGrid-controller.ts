// Connect the grid model to its DOM behaviours.
import { grid, table, type GridOptions } from '@kerf/veneer-core'
import { derived, untrack } from '@kerf/core'
import { use } from '@kerf/veneer-core/kerf'
import type { DataGridProps } from './DataGrid'
import type { Ctx } from './DataGrid-rows'
import {
  gridState,
  gridSource,
  gridLines,
  type GridState,
  type GridSource,
  type GridLines,
} from './DataGrid-model'
import { gridTreeActions } from './DataGrid-tree'
import { gridEditing, gridViewActions } from './DataGrid-actions'

function gridContext<T>({
  props,
  st,
  src,
  isOpen,
  toggle,
  hasDetails,
  say,
}: {
  props: DataGridProps<T>
  st: GridState<T>
  src: GridSource<T>
  isOpen: (key: string) => boolean
  toggle: (key: string, on?: boolean) => void
  hasDetails: boolean
  say: (s: string) => void
}) {
  const { id, all, cols, keyOf, read, query, expanded, refs, busy } = st
  const { treed, kidsOf, rolled } = src
  const namedCol = derived(() => all.value.find((c) => c.rowHeader) ?? all.value[0])
  const ctx: Ctx<T> = {
    id,
    cols: () => cols.value,
    keyOf,
    read,
    treed: () => treed.value,
    get tree() {
      return props.tree
    },
    kidsOf,
    title: (r) => String((read(namedCol.value!, r) as string | number | null | undefined) ?? ''),
    query: () => query.value.trim(),
    rolled,
    commit: (r, c, v) => props.onEdit?.(r, c, v),
    toggle,
    editors: new Map(),
    status: say,
    expanded,
    hasDetails,
    body: (r) => props.expand?.(r),
    flip: (k) => {
      const { [k]: was, ...rest } = expanded.value
      expanded.value = was ? rest : { ...rest, [k]: true }
    },
    refocus: () => refs.behaviour?.refocus(),
    span: () => cols.value.length + (hasDetails ? 1 : 0),
    expandedTree: isOpen,
    busy: (k) => !!(busy.get(k) as boolean | undefined),
  }

  return ctx
}

function gridConnect<T>({
  st,
  src,
  ln,
  ctx,
  toggle,
  editing,
  say,
}: {
  st: GridState<T>
  src: GridSource<T>
  ln: GridLines<T>
  ctx: Ctx<T>
  toggle: (key: string, on?: boolean) => void
  editing: ReturnType<typeof gridEditing<T>>
  say: (s: string) => void
}) {
  const { refs, cols, picked } = st
  const { treed } = src
  const { lines } = ln
  const { reorder, paste } = editing
  use(
    table,
    () => refs.el,
    () => ({ hidden: [], rows: lines.value }),
  )
  use(
    (node: HTMLDivElement, o: GridOptions) => {
      const g = grid(node, o)
      refs.behaviour = g
      return g
    },
    () => refs.el,
    () => ({
      tree: treed.value,
      rows: [lines.value, cols.value],
      onEdit: (c: HTMLElement) => ctx.editors.get(c)?.(),
      onToggle: (r: HTMLElement, on: boolean) => toggle(r.dataset.row!, on),
      onReorder: reorder,
      onSelect: (r: string[]) => (picked.value = r),
      onStatus: say,
      onPaste: paste,
    }),
  )
}

export function gridController<T>(props: DataGridProps<T>) {
  const st = gridState(props)
  const src = gridSource(props, st)
  const ln = gridLines(props, st, src)
  const hasDetails = untrack(() => props.expand !== undefined)
  const say = (s: string) => (st.status.value = s)
  const tree = gridTreeActions({ props, st, src, ln, say, getCtx: () => ctx })
  const ctx: Ctx<T> = gridContext({
    props,
    st,
    src,
    isOpen: tree.isOpen,
    toggle: tree.toggle,
    hasDetails,
    say,
  })
  const editing = gridEditing(props, st, ln, say)
  const views = gridViewActions(props, st, ln, say)

  gridConnect({ st, src, ln, ctx, toggle: tree.toggle, editing, say })
  const hint = () =>
    `Arrows move · Shift extends · ${st.all.value.some((c) => c.edit) ? 'Enter edits · ' : ''}⌘/Ctrl C copies`
  const hasAggregate = derived(() => st.all.value.some((c) => c.aggregate))
  const chosen = () => st.picked.value.filter((k) => !k.startsWith('g:'))
  return { ...st, ...src, ...ln, ...tree, ...views, ctx, hasDetails, hint, hasAggregate, chosen }
}

/** The per-instance grid model used by its views. */
export type GridModel<T> = ReturnType<typeof gridController<T>>
