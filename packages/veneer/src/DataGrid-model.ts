// Per-grid state and derived rows.
import {
  aggregate,
  groupRows,
  leaves,
  matchFilter,
  pageSlice,
  sortRows,
  treeRows,
  uid,
} from '@kerf-js/veneer-core'
import { derived, state, untrack, type State } from '@kerf-js/core'
import type { DataGridProps, GridColumn, GridView } from './DataGrid'
import type { Line } from './DataGrid-rows'

type GridRefs = {
  columnsButton?: HTMLElement | undefined
  el?: HTMLDivElement | undefined
  behaviour?: { refocus(): void } | undefined
}

function gridViewState<T>(props: DataGridProps<T>) {
  const id = uid('grid')
  const all = derived(() => props.columns)
  const keyOf = (r: T) => {
    const key = props.rowKey === undefined ? 'id' : props.rowKey
    return String(typeof key === 'function' ? key(r) : (r as Record<string, unknown>)[key])
  }
  const read = (c: GridColumn<T>, r: T) =>
    c.value ? c.value(r) : (r as Record<string, unknown>)[c.id]
  const fresh = (): GridView => ({
    order: untrack(() => props.columns).map((c) => c.id),
    hidden: [],
    filters: {},
  })
  const saved = state<Record<string, GridView>>(untrack(() => props.views) ?? {})
  const named = state(untrack(() => props.view ?? Object.keys(props.views ?? {})[0] ?? ''))
  const current = state<GridView>(
    untrack(
      () =>
        (props.view && props.views?.[props.view]) ||
        (props.views && Object.values(props.views)[0]) ||
        fresh(),
    ),
  )
  const change = (patch: Partial<GridView>) => (current.value = { ...current.value, ...patch })

  const cols = derived(() =>
    current.value.order
      .map((k) => all.value.find((c) => c.id === k))
      .filter((c): c is GridColumn<T> => !!c && !current.value.hidden.includes(c.id)),
  )
  const showFilters = state(false)
  const canFilter = derived(() => all.value.some((c) => c.filter))
  const canGroup = untrack(() => props.groupBy !== undefined)
  return {
    id,
    all,
    keyOf,
    read,
    fresh,
    saved,
    named,
    current,
    change,
    cols,
    showFilters,
    canFilter,
    canGroup,
  }
}

export function gridState<T>(props: DataGridProps<T>) {
  const refs: GridRefs = {}
  const view = gridViewState(props)
  const closed = state<Record<string, boolean>>({})
  const expanded = state<Record<string, boolean>>({})
  const open = state<Record<string, boolean>>({})
  const closedHere = state<Record<string, boolean>>({})
  const loaded = state<Record<string, readonly T[]>>({})
  const busy = state<Record<string, boolean>>({})
  const query = state('')
  const at = state(1)
  const picked = state<string[]>([])
  const status = state('')
  const picking = state(false)
  const pickerBuilt = state(false)

  return {
    refs,
    ...view,
    closed,
    expanded,
    open,
    closedHere,
    loaded,
    busy,
    query,
    at,
    picked,
    status,
    picking,
    pickerBuilt,
  }
}

export function gridSource<T>(props: DataGridProps<T>, st: ReturnType<typeof gridState<T>>) {
  const { keyOf, loaded, current, all, at, canGroup, read } = st
  const source = (): readonly T[] =>
    Array.isArray(props.rows)
      ? (props.rows as readonly T[])
      : (props.rows as State<readonly T[]>).value // a plain list or a State
  const kidsOf = (r: T): readonly T[] | undefined =>
    loaded.get(keyOf(r)) ?? (props.tree?.kids ?? ((x: T) => (x as { kids?: readonly T[] }).kids))(r)
  const isBranch = (r: T) =>
    props.tree?.branch
      ? props.tree.branch(r)
      : !!(kidsOf(r)?.length || (r as { hasChildren?: boolean }).hasChildren)
  const filtered = derived(() => {
    const f = current.value.filters
    return source().filter((r) =>
      all.value.every((c) => matchFilter(c.filter, f[c.id] ?? '', read(c, r))),
    )
  })
  // what a tree's cell shows for a row: a parent's own field is often empty, and its number is what it rolls up
  const rolled = (c: GridColumn<T>, r: T) => {
    const given = props.tree?.rollup?.(r, c.id)
    if (!c.aggregate) return read(c, r)
    if (kidsOf(r)?.length)
      return typeof c.aggregate === 'function'
        ? c.aggregate(leaves(r, kidsOf))
        : aggregate(
            c.aggregate,
            leaves(r, kidsOf).map((x) => read(c, x)),
          )
    return given ?? read(c, r)
  }
  const shownValue = (c: GridColumn<T>, r: T) =>
    props.tree && isBranch(r) ? rolled(c, r) : read(c, r)
  const sorted = (list: readonly T[]) => {
    const s = current.value.sort
    const by = s && all.value.find((c) => c.id === s.id)
    return by ? sortRows(list, (r) => shownValue(by, r), s.dir) : list
  }
  const ordered = derived(() => sorted(filtered.value))
  const grouped = derived(() => canGroup && !!current.value.group)
  const treed = derived(() => !!props.tree || grouped.value)
  const paged = derived(() =>
    props.page && !props.tree ? pageSlice(ordered.value, at.value - 1, props.page.size) : undefined,
  )
  return {
    source,
    kidsOf,
    isBranch,
    filtered,
    rolled,
    shownValue,
    sorted,
    ordered,
    grouped,
    treed,
    paged,
  }
}

export function gridLines<T>(
  props: DataGridProps<T>,
  st: ReturnType<typeof gridState<T>>,
  src: ReturnType<typeof gridSource<T>>,
) {
  const { query, open, closedHere, busy, all, read, keyOf, closed } = st
  const { kidsOf, sorted, isBranch, ordered, paged, grouped } = src
  const lines = derived<Line<T>[]>(() => {
    if (props.tree) {
      const q = query.value.trim().toLowerCase()
      const under = new Map<T, readonly T[] | undefined>() // treeRows asks more than once, and each level sorts
      const kids = (r: T) => {
        if (!under.has(r)) {
          const k = kidsOf(r)
          under.set(r, k && sorted(k))
        }
        return under.get(r)
      }
      const entries = treeRows(ordered.value, {
        key: keyOf,
        kids,
        branch: isBranch,
        open: (k) => !!(open.get(k) as boolean | undefined),
        closed: (k) => !!(closedHere.get(k) as boolean | undefined),
        match: q
          ? (r) =>
              all.value.some((c) =>
                String((read(c, r) as string | number | null | undefined) ?? '')
                  .toLowerCase()
                  .includes(q),
              )
          : undefined,
      })
      const tops = new Map(ordered.value.map((r, i) => [keyOf(r), (i % 8) + 1]))
      const out: Line<T>[] = []
      const tint = new Map<string, number | undefined>()
      for (const e of entries) {
        const t = e.parent ? tint.get(e.parent) : tops.get(e.key)
        tint.set(e.key, t)
        out.push({ kind: 'row', id: e.key, row: e.row, tree: e, level: e.level, tint: t })
        if (busy.get(e.key))
          out.push({
            kind: 'loading',
            id: `${e.key}/…`,
            level: e.level + 1,
            label: String((read(all.value[0]!, e.row) as string | number | null | undefined) ?? ''),
            tint: t,
          })
      }
      return out
    }
    const list = paged.value?.rows ?? ordered.value
    if (!grouped.value) return list.map((r) => ({ kind: 'row' as const, id: keyOf(r), row: r }))
    const by = all.value.find((c) => c.id === props.groupBy)!
    return [...groupRows(list, (r) => String(read(by, r)))].flatMap(
      ([label, members]): Line<T>[] => {
        const key = `g:${label}`
        const on = !closed.get(key)
        return [
          { kind: 'group', id: key, label, rows: members, open: on },
          ...(on
            ? members.map((r) => ({ kind: 'row' as const, id: keyOf(r), row: r, level: 2 }))
            : []),
        ]
      },
    )
  })
  // an open group lists its rows twice, as the group and as lines
  const visible = derived(() => [
    ...new Set(
      lines.value.flatMap((l) => (l.kind === 'row' ? [l.row] : l.kind === 'group' ? l.rows : [])),
    ),
  ])
  // a tree's footer counts what its parents roll up, once each, open or not
  const footed = derived(() =>
    props.tree ? [...new Set(visible.value.flatMap((r) => leaves(r, kidsOf)))] : visible.value,
  )
  return { lines, visible, footed }
}

export type GridState<T> = ReturnType<typeof gridState<T>>
export type GridSource<T> = ReturnType<typeof gridSource<T>>
export type GridLines<T> = ReturnType<typeof gridLines<T>>
