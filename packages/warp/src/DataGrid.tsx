import { XIcon } from '@weft-js/warp-icons'
import { aggregate, grid, groupRows, leaves, matchFilter, moved, pageSlice, pivotTable, sortRows, table, toCSV, treeRows, uid, type Aggregate, type GridFilter, type TreeEntry } from '@weft-js/warp-core'
import { derived, onCleanup, onMount, state, untrack, watch, type State } from '@weft-js/core'
import { Button } from './Button'
import { Segmented } from './Choice'
import { Search } from './Field'
import { PaginationBar } from './Pagination'
import { Select } from './Select'
import { chevron, ColumnsPanel, columnsIcon, Editor, sortIcon, type Column, type TableSort } from './Table'
import { use } from '@weft-js/warp-core/weft'
import '@weft-js/warp-core/styles/data/chips.css'
import '@weft-js/warp-core/styles/data/chip.css'

export interface GridColumn<T> extends Column<T> {
  /** A control in the filter row: contains, one of `options`, or at least. */
  filter?: GridFilter
  options?: string[]
  /** What the footer, a group's subtotal and a parent's roll-up show for this column. */
  aggregate?: Aggregate | ((rows: T[]) => unknown)
  /** Text for an aggregate, and for the cell when it has no `cell`. */
  format?: (value: any) => string
}

/** A saved view (06 §6). */
export type GridView = { order: string[]; hidden: string[]; filters: Record<string, string>; sort?: TableSort; group?: boolean }

export interface GridTree<T> {
  /** What's already here under a row. Default `row.kids`. */
  kids?: (row: T) => readonly T[] | undefined
  /** Fetch a branch on its first open. The filter's query goes along for the server to apply. */
  load?: (row: T, query: string) => Promise<readonly T[]>
  /** Has it children, loaded or not? Default: any in `kids`, or `row.hasChildren`. */
  branch?: (row: T) => boolean
  /** The server's aggregate for a branch that hasn't loaded. */
  rollup?: (row: T, column: string) => unknown
}

export interface GridPaste<T> { row: T; column: string; value: unknown }

export interface DataGridProps<T> {
  rows: readonly T[] | State<readonly T[]>
  columns: GridColumn<T>[]
  /** Names the grid (required). It stays in the accessibility tree when `captionHidden`. */
  caption: string
  captionHidden?: boolean
  rowKey?: string | ((row: T) => string)
  density?: 'compact' | 'cozy' | 'comfortable'
  /** The named views in the select. */
  views?: Record<string, GridView>
  /** Starts on this view. */
  view?: string
  onSaveView?: (name: string, view: GridView) => void
  /** The Group toggle groups by this column. */
  groupBy?: string
  /** role=treegrid over hierarchical rows. */
  tree?: GridTree<T>
  /** Show the tree's filter field, labelled this. */
  filter?: string
  onEdit?: (row: T, column: string, value: any) => void
  /** A validated paste, as one change. Default each cell through `onEdit`. */
  onPaste?: (changes: GridPaste<T>[]) => void
  /** A row's details, under it. */
  expand?: (row: T) => any
  /** The bulk bar's actions, over the rows in the range. */
  bulk?: (rows: string[]) => any
  page?: { size: number }
  /** The CSV's name; `false` drops Export. */
  exportName?: string | false
  actions?: any
  maxHeight?: string
}

type Line<T> =
  | { kind: 'row'; id: string; row: T; tree?: TreeEntry<T>; level?: number; tint?: number }
  | { kind: 'group'; id: string; label: string; rows: T[]; open: boolean }
  | { kind: 'loading'; id: string; level: number; label: string; tint?: number }

type Ctx<T> = {
  id: string
  cols: () => GridColumn<T>[]
  keyOf: (r: T) => string
  read: (c: GridColumn<T>, r: T) => any
  title: (r: T) => string
  treed: () => boolean
  tree?: GridTree<T>
  query: () => string
  rolled: (c: GridColumn<T>, r: T) => any
  kidsOf: (r: T) => readonly T[] | undefined
  commit: (r: T, c: string, v: any) => void
  toggle: (key: string, open?: boolean) => void
  editors: Map<HTMLElement, () => void>
  refocus: () => void
  status: (s: string) => void
  expanded: State<Record<string, boolean>>
  expandedTree: (key: string) => boolean
  busy: (key: string) => boolean
  hasDetails: boolean
  flip: (key: string) => void
  span: () => number
  body?: (r: T) => any
}

const shownText = (c: GridColumn<any>, v: any) => (c.format ? c.format(v) : v)
const total = <T,>(c: GridColumn<T>, rows: T[], read: (c: GridColumn<T>, r: T) => any) => {
  if (!c.aggregate) return ''
  const v = typeof c.aggregate === 'function' ? c.aggregate(rows) : aggregate(c.aggregate, rows.map(r => read(c, r)))
  return shownText(c, v)
}
const REORDER = 'Alt plus left or right arrow moves this column.'

function Hits({ text, query }: { text: string; query: string }) {
  const at = derived(() => (query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1))
  return <>{at.value < 0 ? text : <>{text.slice(0, at.value)}<mark data-part="hit">{text.slice(at.value, at.value + query.length)}</mark>{text.slice(at.value + query.length)}</>}</>
}

function GridCell<T>({ line, col, first, ctx }: { line: Extract<Line<T>, { kind: 'row' }>; col: GridColumn<T>; first: boolean; ctx: Ctx<T> }) {
  const c = untrack(() => col)
  const editing = state(false)
  const problem = state('')
  const message = () => `${ctx.id}-${line.id}-${c.id}-e`
  const row = () => line.row
  const value = () => (line.tree?.branch ? ctx.rolled(c, row()) : ctx.read(c, row()))
  let td: HTMLElement | undefined
  let seed = ''
  const begin = () => {
    if (!c.edit || editing.value) return
    seed = String(untrack(() => ctx.read(c, row())) ?? '')
    problem.value = ''
    editing.value = true
  }
  onMount(() => { if (c.edit) { ctx.editors.set(td!, begin); onCleanup(() => ctx.editors.delete(td!)) } })
  const done = (save: boolean, text: string) => {
    if (!editing.value) return
    if (save) {
      const next = typeof c.edit === 'function' ? c.edit(text) : text
      const ok = c.validate?.(next) ?? true
      if (ok !== true) {
        problem.value = typeof ok === 'string' ? ok : 'That value is not valid'
        ctx.status(problem.value)
        return
      }
      ctx.commit(row(), c.id, next)
    }
    problem.value = ''
    editing.value = false
    ctx.refocus()
  }
  const blur = (s: boolean, t: string) => { done(s, t); if (editing.value) { problem.value = ''; editing.value = false } } // an invalid value left behind is dropped
  const body = () => (c.cell ? c.cell(row()) : shownText(c, value()))
  const treeCell = derived(() => line.tree !== undefined && first)
  const shown = derived(() => shownText(c, value()))
  return (
    <td
      ref={(n: any) => (td = n)}
      role={treeCell.value || c.rowHeader ? 'rowheader' : 'gridcell'}
      tabindex="-1"
      data-col={c.id}
      data-numeric={c.numeric ? '' : undefined}
      data-pinned={c.pin ? 'last' : undefined}
      data-editable={c.edit ? '' : undefined}
      data-invalid={problem.value ? '' : undefined}
      data-part={treeCell.value ? 'tree-cell' : undefined}
    >
      {editing.value
        ? <><Editor label={`${c.header} for ${ctx.title(row())}`} start={seed} invalid={!!problem.value} describedby={problem.value ? message() : undefined} onDone={(save, text) => done(save, text)} onLeave={blur} />{problem.value && <span data-part="sr-only" id={message()} role="alert">{problem.value}</span>}</>
        : treeCell.value
          ? <span data-part="tree-label"><span data-part="toggle" data-leaf={line.tree!.branch ? undefined : ''} aria-hidden="true" onClick={() => ctx.toggle(line.id)}>{chevron()}</span><span data-part="primary">{c.cell ? body() : <Hits text={shown.value} query={ctx.query()} />}</span></span>
          : body()}
    </td>
  )
}

function GridRow<T>({ line, ctx }: { line: Extract<Line<T>, { kind: 'row' }>; ctx: Ctx<T> }) {
  const open = () => !!ctx.expanded.get(line.id)
  const detail = () => `${ctx.id}-x-${line.id}`
  const branch = () => line.tree?.branch
  return (
    <>
      <tr
        role="row"
        data-row={line.id}
        tabindex={ctx.treed() ? '-1' : undefined}
        aria-level={line.level}
        aria-setsize={line.tree?.size}
        aria-posinset={line.tree?.pos}
        aria-expanded={branch() ? (ctx.expandedTree(line.id) ? 'true' : 'false') : undefined}
        aria-busy={ctx.busy(line.id) ? 'true' : undefined}
        data-context={line.tree?.context ? '' : undefined}
        style={line.level ? `--_lvl:${line.level}${line.tint ? `;--_bc:var(--warp-color-data-${line.tint})` : ''}` : undefined}
      >
        {ctx.hasDetails && <td role="gridcell" tabindex="-1" style="padding-inline:4px"><button type="button" tabindex="-1" data-part="expand" aria-expanded={open() ? 'true' : 'false'} aria-controls={open() ? detail() : undefined} aria-label={`Details for ${ctx.title(line.row)}`} onClick={() => ctx.flip(line.id)}>{chevron()}</button></td>}
        {ctx.cols().map((c, at) => <GridCell key={c.id} line={line} col={c} first={at === 0} ctx={ctx} />)}
      </tr>
      {open() && <tr data-part="detail" role="row" id={detail()}><td role="gridcell" colspan={ctx.span()}><div data-part="slide"><div><div>{ctx.body?.(line.row)}</div></div></div></td></tr>}
    </>
  )
}

function GroupRow<T>({ line, ctx }: { line: Extract<Line<T>, { kind: 'group' }>; ctx: Ctx<T> }) {
  const sub = () => {
    const c = ctx.cols().find(x => x.aggregate && x.aggregate !== 'count')
    const n = line.rows.length
    return `${n} ${n === 1 ? 'row' : 'rows'}${c ? ` · ${total(c, line.rows, ctx.read)}` : ''}`
  }
  return (
    <tr role="row" data-part="group" data-row={line.id} tabindex="-1" aria-level="1" aria-expanded={line.open ? 'true' : 'false'}>
      <td role="gridcell" tabindex="-1" colspan={ctx.span()}><button type="button" tabindex="-1" aria-expanded={line.open ? 'true' : 'false'} onClick={() => ctx.toggle(line.id)}>{chevron()}<b>{line.label}</b> {sub()}</button></td>
    </tr>
  )
}

/**
 * The data grid (06 §6; data.html:1643-1787, treegrid 2482): a Table's parts as role=grid, or treegrid when grouped or
 * hierarchical, with one tab stop. Arrows move the cell, Shift extends a range, ⌘/Ctrl C copies it as TSV, Enter or F2
 * edits and an invalid value never commits. Headers reorder by dragging or Alt + ←/→. A filter row with applied chips,
 * group and aggregate rows, saved views, CSV, a bulk bar and details. Rows and cells are keyed, so a reorder moves nodes.
 */
export function DataGrid<T>({ rows, columns, caption, captionHidden, rowKey = 'id', density, views, view, onSaveView, groupBy, tree, filter, onEdit, onPaste, expand, bulk, page, exportName = 'export', actions, maxHeight }: DataGridProps<T>) {
  const id = uid('grid')
  const all = derived(() => columns)
  const keyOf = (r: T) => String(typeof rowKey === 'function' ? rowKey(r) : (r as any)[rowKey])
  const read = (c: GridColumn<T>, r: T) => (c.value ? c.value(r) : (r as any)[c.id])
  const fresh = (): GridView => ({ order: untrack(() => columns).map(c => c.id), hidden: [], filters: {} })
  const saved = state<Record<string, GridView>>(untrack(() => views) ?? {})
  const named = state(untrack(() => view ?? Object.keys(views ?? {})[0] ?? ''))
  const current = state<GridView>(untrack(() => (view && views?.[view]) || (views && Object.values(views)[0]) || fresh()))
  const change = (patch: Partial<GridView>) => (current.value = { ...current.value, ...patch })

  const cols = derived(() => current.value.order.map(k => all.value.find(c => c.id === k)).filter((c): c is GridColumn<T> => !!c && !current.value.hidden.includes(c.id)))
  const showFilters = state(false)
  const canFilter = derived(() => all.value.some(c => c.filter))
  const canGroup = untrack(() => groupBy !== undefined)
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
  let columnsButton: HTMLElement | undefined
  let el: HTMLDivElement | undefined
  let behaviour: { refocus(): void } | undefined

  const source = () => { const r: any = rows; return Array.isArray(r) ? r : r.value } // a plain list or a State
  const kidsOf = (r: T): readonly T[] | undefined => loaded.get(keyOf(r)) ?? (tree?.kids ?? ((x: any) => x.kids))(r)
  const isBranch = (r: T) => (tree?.branch ? tree.branch(r) : !!(kidsOf(r)?.length || (r as any).hasChildren))
  const filtered = derived(() => {
    const f = current.value.filters
    return (source() as readonly T[]).filter(r => all.value.every(c => matchFilter(c.filter, f[c.id] ?? '', read(c, r))))
  })
  const ordered = derived(() => {
    const s = current.value.sort
    const by = s && all.value.find(c => c.id === s.id)
    return by ? sortRows(filtered.value, r => read(by, r), s.dir) : filtered.value
  })
  const grouped = derived(() => canGroup && !!current.value.group)
  const treed = derived(() => !!tree || grouped.value)
  const paged = derived(() => (page && !tree ? pageSlice(ordered.value, at.value - 1, page.size) : undefined))
  const lines = derived<Line<T>[]>(() => {
    if (tree) {
      const q = query.value.trim().toLowerCase()
      const entries = treeRows(ordered.value, {
        key: keyOf, kids: kidsOf, branch: isBranch, open: k => !!open.get(k), closed: k => !!closedHere.get(k),
        match: q ? r => all.value.some(c => String(read(c, r) ?? '').toLowerCase().includes(q)) : undefined,
      })
      const tops = new Map(ordered.value.map((r, i) => [keyOf(r), i % 8 + 1]))
      const out: Line<T>[] = []
      const tint = new Map<string, number | undefined>()
      for (const e of entries) {
        const t = e.parent ? tint.get(e.parent) : tops.get(e.key)
        tint.set(e.key, t)
        out.push({ kind: 'row', id: e.key, row: e.row, tree: e, level: e.level, tint: t })
        if (busy.get(e.key)) out.push({ kind: 'loading', id: `${e.key}/…`, level: e.level + 1, label: String(read(all.value[0], e.row) ?? ''), tint: t })
      }
      return out
    }
    const list = paged.value?.rows ?? ordered.value
    if (!grouped.value) return list.map(r => ({ kind: 'row' as const, id: keyOf(r), row: r }))
    const by = all.value.find(c => c.id === groupBy)!
    return [...groupRows(list, r => String(read(by, r)))].flatMap(([label, members]): Line<T>[] => {
      const key = `g:${label}`
      const on = !closed.get(key)
      return [{ kind: 'group', id: key, label, rows: members, open: on }, ...(on ? members.map(r => ({ kind: 'row' as const, id: keyOf(r), row: r, level: 2 })) : [])]
    })
  })
  const visible = derived(() => lines.value.flatMap(l => (l.kind === 'row' ? [l.row] : l.kind === 'group' ? l.rows : [])))
  // a tree's footer counts what its parents roll up, once each, open or not
  const footed = derived(() => (tree ? [...new Set(visible.value.flatMap(r => leaves(r as T, kidsOf)))] : visible.value))
  const hasDetails = untrack(() => expand !== undefined)
  const say = (s: string) => (status.value = s)

  const rowOf = (key: string) => (lines.value.find(l => l.id === key && l.kind === 'row') as Extract<Line<T>, { kind: 'row' }> | undefined)?.row
  const setOpen = async (key: string, on: boolean) => {
    const q = query.value.trim()
    if (q) { closedHere.value = { ...closedHere.value, [key]: !on }; return }
    open.value = { ...open.value, [key]: on }
    const row = rowOf(key)
    if (!on || !row || kidsOf(row) !== undefined || !tree?.load) return
    busy.value = { ...busy.value, [key]: true }
    try {
      const got = await tree.load(row, query.value)
      loaded.value = { ...loaded.value, [key]: got }
      say(`${ctx.title(row)} expanded, ${got.length} ${got.length === 1 ? 'row' : 'rows'} loaded`)
    } catch {
      open.value = { ...open.value, [key]: false }
      say(`${ctx.title(row)} couldn’t load`)
    } finally {
      const { [key]: _, ...rest } = busy.value
      busy.value = rest
    }
  }
  const isOpen = (key: string) => (query.value.trim() ? !closedHere.get(key) : !!open.get(key))
  const toggle = (key: string, on?: boolean) => {
    if (key.startsWith('g:')) { closed.value = { ...closed.value, [key]: on === undefined ? !closed.get(key) : !on }; return }
    void setOpen(key, on ?? !isOpen(key))
  }
  watch(() => query.value, () => { closedHere.value = {} })
  const expandAll = (on: boolean) => {
    if (!on) { open.value = {}; return }
    const next: Record<string, boolean> = {}
    const walk = (list: readonly T[]) => { for (const r of list) { const kids = kidsOf(r); if (kids?.length) { next[keyOf(r)] = true; walk(kids) } } }
    walk(ordered.value)
    open.value = next
  }

  const namedCol = derived(() => all.value.find(c => c.rowHeader) ?? all.value[0])
  const ctx: Ctx<T> = {
    id, cols: () => cols.value, keyOf, read, treed: () => treed.value, get tree() { return tree }, kidsOf,
    title: r => String(read(namedCol.value, r) ?? ''),
    query: () => query.value.trim(),
    rolled(c, r) {
      const given = tree?.rollup?.(r, c.id)
      if (!c.aggregate) return read(c, r)
      if (kidsOf(r)?.length) return typeof c.aggregate === 'function' ? c.aggregate(leaves(r, kidsOf)) : aggregate(c.aggregate, leaves(r, kidsOf).map(x => read(c, x)))
      return given ?? read(c, r)
    },
    commit: (r, c, v) => onEdit?.(r, c, v),
    toggle, editors: new Map(), status: say, expanded, hasDetails, body: r => expand?.(r),
    flip: k => { const { [k]: was, ...rest } = expanded.value; expanded.value = was ? rest : { ...rest, [k]: true } },
    refocus: () => behaviour?.refocus(),
    span: () => cols.value.length + (hasDetails ? 1 : 0),
    expandedTree: isOpen, busy: k => !!busy.get(k),
  }

  const reorder = (col: string, to: number) => {
    const order = current.value.order.filter(k => !current.value.hidden.includes(k))
    const placed = moved(order, col, to)
    change({ order: [...placed, ...current.value.order.filter(k => current.value.hidden.includes(k))] })
    const c = all.value.find(x => x.id === col)
    say(`${c?.header} moved to column ${placed.indexOf(col) + 1} of ${placed.length}`)
    queueMicrotask(() => el?.querySelector<HTMLElement>(`thead th[data-col="${col}"] button`)?.focus())
  }
  const paste = (cell: HTMLElement, matrix: string[][]) => {
    const flat = lines.value.filter(l => l.kind === 'row') as Extract<Line<T>, { kind: 'row' }>[]
    const startRow = flat.findIndex(l => l.id === cell.parentElement!.dataset.row)
    const startCol = cols.value.findIndex(c => c.id === cell.dataset.col)
    const changes: GridPaste<T>[] = []
    let refused = 0
    matrix.forEach((line, r) => line.forEach((text, c) => {
      const row = flat[startRow + r], col = cols.value[startCol + c]
      if (!row || !col?.edit) return void refused++
      const value = typeof col.edit === 'function' ? col.edit(text) : text
      if ((col.validate?.(value) ?? true) !== true) return void refused++
      changes.push({ row: row.row, column: col.id, value })
    }))
    if (changes.length) { if (onPaste) onPaste(changes); else for (const x of changes) onEdit?.(x.row, x.column, x.value) }
    say(`Pasted ${changes.length} ${changes.length === 1 ? 'cell' : 'cells'}${refused ? `, ${refused} refused` : ''}`)
  }
  const toggleHidden = (c: GridColumn<T>, on: boolean) => change({ hidden: on ? current.value.hidden.filter(x => x !== c.id) : [...current.value.hidden, c.id] })
  const askSort = (c: GridColumn<T>) => { const s = current.value.sort; change({ sort: { id: c.id, dir: s?.id === c.id && s.dir === 'ascending' ? 'descending' : 'ascending' } }) }
  const setFilter = (k: string, v: string) => { at.value = 1; const f = { ...current.value.filters }; if (v) f[k] = v; else delete f[k]; change({ filters: f }) }
  const applied = derived(() => Object.entries(current.value.filters).map(([k, v]) => ({ k, v, c: all.value.find(x => x.id === k) })))
  const opOf = (c?: GridColumn<T>) => (c?.filter === 'min' ? '≥' : c?.filter === 'text' ? '~' : '=')

  const save = () => {
    const name = `My view ${Object.keys(saved.value).filter(k => k.startsWith('My view')).length + 1}`
    saved.value = { ...saved.value, [name]: structuredClone(current.value) }
    named.value = name
    onSaveView?.(name, current.value)
    say(`Saved “${name}”`)
  }
  const useView = (name: string) => {
    const v = saved.value[name]
    if (!v) return
    named.value = name
    closed.value = {}
    at.value = 1
    current.value = structuredClone(v)
  }
  const download = () => {
    const shown = cols.value
    const csv = toCSV(shown.map(c => c.header), visible.value.map(r => shown.map(c => shownText(c, read(c, r)))))
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }))
    a.download = `${exportName}.csv`
    a.click()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
    say(`Exported ${visible.value.length} rows`)
  }

  use(table, () => el, () => ({ hidden: [], rows: lines.value }))
  use((node: HTMLDivElement, o: any) => { const g = grid(node, o); behaviour = g; return g }, () => el, () => ({
    tree: treed.value, rows: [lines.value, cols.value],
    onEdit: (c: HTMLElement) => ctx.editors.get(c)?.(),
    onToggle: (r: HTMLElement, on: boolean) => toggle(r.dataset.row!, on),
    onReorder: reorder, onSelect: (r: string[]) => (picked.value = r), onStatus: say, onPaste: paste,
  }))
  const hint = () => `Arrows move · Shift extends · ${all.value.some(c => c.edit) ? 'Enter edits · ' : ''}⌘/Ctrl C copies`
  const hasAggregate = derived(() => all.value.some(c => c.aggregate))
  const chosen = () => picked.value.filter(k => !k.startsWith('g:'))
  return (
    <div ref={(n: any) => (el = n)} data-scope="table" data-phone="columns" data-density={density} data-tree={tree ? '' : undefined} id={id}>
      <div data-part="toolbar">
        {filter !== undefined && <Search label={filter} value={query.value} onInput={(e: any) => (query.value = e.currentTarget.value)} />}
        {views && <Select label="View" size="sm" value={named.value} options={Object.keys(saved.value).map(v => ({ value: v, label: v }))} onChange={(e: any) => useView(e.currentTarget.value)} />}
        {views && <Button emphasis="ghost" tone="neutral" onClick={save}>Save view</Button>}
        {applied.value.length > 0 && (
          <div data-scope="chips" role="group" aria-label="Applied filters">
            {applied.value.map(f => <span key={f.k} data-scope="chip">{f.c?.header} {opOf(f.c)} <b>{f.v}</b><button type="button" aria-label={`Remove filter ${f.c?.header}`} onClick={() => setFilter(f.k, '')}><XIcon /></button></span>)}
            <button type="button" data-part="clear" onClick={() => change({ filters: {} })}>Clear all</button>
          </div>
        )}
        <span data-part="spacer"></span>
        {actions}
        {tree && <Button emphasis="outline" tone="neutral" onClick={() => expandAll(true)}>Expand all</Button>}
        {tree && <Button emphasis="outline" tone="neutral" onClick={() => expandAll(false)}>Collapse all</Button>}
        {canFilter.value && <Button emphasis="outline" tone="neutral" aria-pressed={showFilters.value ? 'true' : 'false'} onClick={() => (showFilters.value = !showFilters.value)}>Filters</Button>}
        {canGroup && <Button emphasis="outline" tone="neutral" aria-pressed={current.value.group ? 'true' : 'false'} onClick={() => change({ group: !current.value.group })}>Group</Button>}
        <div>
          <Button emphasis="outline" tone="neutral" ref={(n: any) => (columnsButton = n)} aria-expanded={picking.value ? 'true' : 'false'} aria-controls={pickerBuilt.value ? `${id}-cols` : undefined} onClick={() => { pickerBuilt.value = true; picking.value = !picking.value }}>{columnsIcon()}Columns</Button>
          {pickerBuilt.value && <ColumnsPanel id={`${id}-cols`} open={picking} trigger={() => columnsButton!} items={all.value.filter(c => !c.pin)} shown={c => !current.value.hidden.includes(c.id)} flip={toggleHidden} />}
        </div>
        {exportName !== false && <Button emphasis="outline" tone="neutral" onClick={download}>Export CSV</Button>}
      </div>
      {bulk && (
        <div data-part="bulk" hidden={chosen().length === 0} role="region" aria-label="Bulk actions">
          <b>{chosen().length} selected</b>
          {bulk(chosen())}
        </div>
      )}
      <div data-part="viewport" tabindex="-1" style={maxHeight ? `--warp-table-max-h:${maxHeight}` : undefined}>
        <table role={treed.value ? 'treegrid' : 'grid'} aria-labelledby={`${id}-cap`} aria-describedby={`${id}-hint`} aria-multiselectable="true" aria-rowcount={visible.value.length + 1} aria-colcount={ctx.span()}>
          <caption id={`${id}-cap`} data-part={captionHidden ? 'sr-only' : undefined}>{caption}</caption>
          <thead>
            <tr role="row">
              {hasDetails && <th role="columnheader" scope="col" style="inline-size:1px;padding-inline:4px"><span data-part="sr-only">Details</span></th>}
              {cols.value.map(c => (
                <th key={c.id} role="columnheader" scope="col" data-col={c.id} data-numeric={c.numeric ? '' : undefined} data-pinned={c.pin ? 'last' : undefined} draggable="true" aria-sort={current.value.sort?.id === c.id ? current.value.sort.dir : undefined}>
                  {c.sort ? <button type="button" data-part="sort" aria-describedby={`${id}-move`} onClick={() => askSort(c)}>{c.header}{sortIcon()}</button> : <button type="button" data-part="sort" aria-describedby={`${id}-move`}>{c.header}</button>}
                  {c.resize && <span data-part="resize" role="separator" aria-orientation="vertical" tabindex="0" aria-label={`Resize ${c.header} column`} aria-valuenow="80" aria-valuemin="80" aria-valuemax="480"></span>}
                </th>
              ))}
            </tr>
            {showFilters.value && (
              <tr role="row" data-part="filters">
                {hasDetails && <th role="columnheader"><span data-part="sr-only">Details</span></th>}
                {cols.value.map(c => (
                  <th key={c.id} role="columnheader">
                    {c.filter === 'select'
                      ? <label><span data-part="sr-only">{`Filter ${c.header}`}</span><select value={current.value.filters[c.id] ?? ''} onChange={(e: any) => setFilter(c.id, e.currentTarget.value)}><option value="">Any</option>{c.options?.map(o => <option key={o} value={o} selected={o === current.value.filters[c.id]}>{o}</option>)}</select></label>
                      : c.filter
                        ? <label><span data-part="sr-only">{c.filter === 'min' ? `${c.header} at least` : `Filter ${c.header}`}</span><input value={current.value.filters[c.id] ?? ''} inputmode={c.filter === 'min' ? 'numeric' : undefined} placeholder={c.filter === 'min' ? '≥' : 'Contains…'} onInput={(e: any) => setFilter(c.id, e.currentTarget.value)} /></label>
                        : <span data-part="sr-only">{`No filter for ${c.header}`}</span>}
                  </th>
                ))}
              </tr>
            )}
          </thead>
          <tbody>
            {lines.value.map(l => (l.kind === 'row'
              ? <GridRow key={l.id} line={l} ctx={ctx} />
              : l.kind === 'group'
                ? <GroupRow key={l.id} line={l} ctx={ctx} />
                : <tr key={l.id} role="row" data-part="loading" aria-level={l.level} style={`--_lvl:${l.level}${l.tint ? `;--_bc:var(--warp-color-data-${l.tint})` : ''}`}><td role="gridcell" data-part="tree-cell" colspan={ctx.span()}><span data-part="tree-label"><span data-part="toggle" data-leaf="" aria-hidden="true">{chevron()}</span>{`Loading ${l.label}…`}<span data-part="skeleton" aria-hidden="true"></span></span></td></tr>))}
          </tbody>
          {hasAggregate.value && (
            <tfoot>
              <tr role="row" data-part="aggregate">
                {hasDetails && <td role="gridcell"></td>}
                {cols.value.map((c, n) => <td key={c.id} role="gridcell" data-numeric={c.numeric ? '' : undefined} data-pinned={c.pin ? 'last' : undefined}>{n === 0 && !c.aggregate ? `${footed.value.length} ${footed.value.length === 1 ? 'row' : 'rows'}` : total(c, footed.value as T[], read)}</td>)}
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <div data-part="footer">
        <span id={`${id}-hint`}>{hint()}</span>
        <span aria-live="polite">{status.value}</span>
      </div>
      {paged.value && <PaginationBar total={ordered.value.length} page={at} size={page!.size} sizes={[page!.size]} />}
      <span data-part="sr-only" id={`${id}-move`}>{REORDER}</span>
    </div>
  )
}

export interface PivotMeasure<T> { id: string; label: string; value: (row: T) => number; format?: (v: number) => string }

/** A pivot (06 §6; data.html:1790): rows × columns × a measure, heat cells and totals both ways. */
export function PivotTable<T>({ rows, caption, row, column, rowHeader = '', measures }: { rows: readonly T[]; caption: string; row: (r: T) => string; column: (r: T) => string; rowHeader?: string; measures: PivotMeasure<T>[] }) {
  const measure = state(untrack(() => measures[0].id))
  const m = derived(() => measures.find(x => x.id === measure.value) ?? measures[0])
  const p = derived(() => pivotTable(rows, row, column, m.value.value))
  const f = (v: number) => (m.value.format ? m.value.format(v) : String(v))
  return (
    <div data-scope="table" data-phone="columns">
      {measures.length > 1 && <div data-part="toolbar"><span data-part="spacer"></span><Segmented label="Pivot measure" value={measure.value} options={measures.map(x => ({ value: x.id, label: x.label }))} onChange={(v: string) => (measure.value = v)} /></div>}
      <div data-part="viewport" tabindex="0" role="region" aria-label={caption}>
        <table>
          <caption data-part="sr-only">{caption}</caption>
          <thead><tr><th scope="col">{rowHeader || <span data-part="sr-only">Rows</span>}</th>{p.value.colKeys.map(c => <th key={c} scope="col" data-numeric="">{c}</th>)}<th scope="col" data-numeric="">Total</th></tr></thead>
          <tbody>
            {p.value.rowKeys.map((r, i) => <tr key={r}><th scope="row">{r}</th>{p.value.colKeys.map((c, j) => <td key={c} data-numeric="" data-heat="" style={`--v:${p.value.cells[i][j].share.toFixed(2)}`}>{p.value.cells[i][j].value ? f(p.value.cells[i][j].value) : '–'}</td>)}<td data-numeric=""><b>{f(p.value.rowTotals[i])}</b></td></tr>)}
          </tbody>
          <tfoot><tr data-part="aggregate"><th scope="row">Total</th>{p.value.colTotals.map((v, j) => <td key={j} data-numeric="">{f(v)}</td>)}<td data-numeric="">{f(p.value.total)}</td></tr></tfoot>
        </table>
      </div>
    </div>
  )
}
