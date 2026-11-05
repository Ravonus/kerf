// Per-grid tree expansion and loading.
import { watch } from '@weft-js/core'
import type { DataGridProps } from './DataGrid'
import type { Ctx, Line } from './DataGrid-rows'
import type { GridState, GridSource, GridLines } from './DataGrid-model'

function gridFetch<T>(
  props: DataGridProps<T>,
  st: GridState<T>,
  say: (s: string) => void,
  getCtx: () => Ctx<T>,
) {
  const { busy, query, loaded, open } = st
  const fetching = new Map<string, Promise<boolean>>()
  const fetchKids = (key: string, row: T) => {
    const running = fetching.get(key)
    if (running) return running
    const run = (async () => {
      busy.value = { ...busy.value, [key]: true }
      try {
        const got = await props.tree!.load!(row, query.value)
        loaded.value = { ...loaded.value, [key]: got }
        say(
          `${getCtx().title(row)} expanded, ${got.length} ${got.length === 1 ? 'row' : 'rows'} loaded`,
        )
        return true
      } catch {
        open.value = { ...open.value, [key]: false }
        say(`${getCtx().title(row)} couldn’t load`)
        return false
      } finally {
        const { [key]: _, ...rest } = busy.value
        busy.value = rest
        fetching.delete(key)
      }
    })()
    fetching.set(key, run)
    return run
  }
  return fetchKids
}

function gridExpandAll<T>(
  props: DataGridProps<T>,
  st: GridState<T>,
  src: GridSource<T>,
  fetchKids: (key: string, row: T) => Promise<boolean>,
  say: (s: string) => void,
  getCtx: () => Ctx<T>,
) {
  const { open, query, keyOf } = st
  const { isBranch, kidsOf, ordered } = src
  let expanding = 0 // a run of Expand all; Collapse all, or a newer run, ends it
  const expandAll = (on: boolean) => {
    const run = ++expanding
    if (!on) {
      open.value = {}
      return
    }
    // a filter's results are the server's, so it only opens what's here; otherwise a branch not loaded yet loads, and so on down
    const lazy = !query.value.trim() && !!props.tree?.load
    const failed: string[] = []
    const descend = async (list: readonly T[]): Promise<unknown> => {
      const branches = list.filter(isBranch)
      if (run !== expanding || !branches.length) return
      open.value = { ...open.value, ...Object.fromEntries(branches.map((r) => [keyOf(r), true])) }
      return Promise.all(
        branches.map(async (r) => {
          const key = keyOf(r)
          if (lazy && kidsOf(r) === undefined && !(await fetchKids(key, r)))
            failed.push(getCtx().title(r))
          return descend(kidsOf(r) ?? [])
        }),
      )
    }
    // the status holds one line, and a failure outranks the rows that loaded after it
    void descend(ordered.value).then(() => {
      if (failed.length)
        say(
          failed.length === 1
            ? `${failed[0]} couldn’t load`
            : `${failed.length} rows couldn’t load`,
        )
    })
  }

  return expandAll
}

export function gridTreeActions<T>(
  props: DataGridProps<T>,
  st: GridState<T>,
  src: GridSource<T>,
  ln: GridLines<T>,
  say: (s: string) => void,
  getCtx: () => Ctx<T>,
) {
  const { query, closedHere, open, closed } = st
  const { kidsOf } = src
  const { lines } = ln
  const rowOf = (key: string) =>
    (
      lines.value.find((l) => l.id === key && l.kind === 'row') as
        | Extract<Line<T>, { kind: 'row' }>
        | undefined
    )?.row
  const fetchKids = gridFetch(props, st, say, getCtx)
  const setOpen = async (key: string, on: boolean) => {
    const q = query.value.trim()
    if (q) {
      closedHere.value = { ...closedHere.value, [key]: !on }
      return
    }
    open.value = { ...open.value, [key]: on }
    const row = rowOf(key)
    if (on && row && kidsOf(row) === undefined && props.tree?.load) await fetchKids(key, row)
  }
  const isOpen = (key: string) =>
    query.value.trim() ? !closedHere.get(key) : !!(open.get(key) as boolean | undefined)
  const toggle = (key: string, on?: boolean) => {
    if (key.startsWith('g:')) {
      closed.value = { ...closed.value, [key]: on === undefined ? !closed.get(key) : !on }
      return
    }
    void setOpen(key, on ?? !isOpen(key))
  }
  watch(
    () => query.value,
    () => {
      closedHere.value = {}
    },
  )
  const expandAll = gridExpandAll(props, st, src, fetchKids, say, getCtx)
  return { isOpen, toggle, expandAll }
}
