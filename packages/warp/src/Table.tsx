import { ColumnsIcon } from '@weft/icons'
import { checkState, filterRows, hideRule, pageSlice, popover, pushLayer, rangeOf, sortRows, table, uid, type SortDir } from '@weft/ui-core'
import { derived, onCleanup, onMount, state, type Resource, type State, untrack, watch } from 'weft'
import { Button } from './Button'
import { Checkbox } from './Choice'
import { Search } from './Field'
import { Select } from './Select'
import { use } from './use'
import './styles'
import '@weft/ui-core/styles/components/popover.css' // the Columns panel
import '@weft/ui-core/styles/data/tokens.css'
import '@weft/ui-core/styles/data/base.css'
import '@weft/ui-core/styles/data/table.css'
import '@weft/ui-core/styles/data/desc.css'

export interface Column<T> {
  id: string
  /** Text: it also labels the cell on a phone card and the Columns checkbox. */
  header: string
  /** What the cell holds, sorts by and filters on. Default `row[id]`. */
  value?: (row: T) => any
  /** How the cell draws it. Default the value as text. */
  cell?: (row: T) => any
  /** `true` sorts by `value`; a function sorts by what it returns. */
  sort?: boolean | ((row: T) => unknown)
  numeric?: boolean
  /** Sticky at the inline start. */
  pin?: boolean
  rowHeader?: boolean
  /** 2 hides under 760px of table width, 3 under 1000px; a row's details still list it. */
  priority?: 2 | 3
  /** Where it goes on a phone card. */
  card?: 'title' | 'badge' | 'hide'
  resize?: boolean
  /** Inline edit: `true` commits the text, a function turns the text into the value. */
  edit?: boolean | ((text: string) => unknown)
  /** `true`, or the message to show: an invalid value never commits. */
  validate?: (value: any) => true | string | boolean
  /** A number that ticks: the cell flashes on change and the row is never rebuilt. */
  live?: boolean
}

/** The V2 list envelope. `next`/`prev` are cursors; absent means there is no such page. */
export type ListPage<T> = { items: T[]; total?: number; next?: unknown; prev?: unknown }
export type TableSort = { id: string; dir: SortDir }
export type TableStatus = 'ready' | 'loading' | 'empty' | 'error'

export interface TableProps<T> {
  rows: readonly T[] | State<readonly T[]> | Resource<readonly T[] | ListPage<T>>
  /** Names the table (required, 06 §5). It stays in the accessibility tree when `captionHidden`. */
  caption: string
  captionHidden?: boolean
  columns: Column<T>[]
  /** The field that identifies a row, or how to get it. Default `id`. */
  rowKey?: string | ((row: T) => string)
  phone?: 'cards' | 'columns'
  density?: 'compact' | 'cozy' | 'comfortable'
  /** Show the filter field, labelled this. */
  filter?: string
  query?: State<string>
  sort?: State<TableSort | undefined>
  onSortChange?: (sort: TableSort) => void
  /** The rows arrive sorted, filtered and paged (a Resource's are): the table only reports what's asked. */
  server?: boolean
  /** Checkboxes, Shift-click ranges and the bulk bar. */
  selection?: boolean | State<Record<string, boolean>>
  onSelectionChange?: (keys: string[]) => void
  /** The bulk bar's actions. */
  bulk?: (keys: string[]) => any
  page?: { size: number }
  onPageChange?: (to: unknown, reason: 'next' | 'prev') => void
  /** A row's details. Default a list of every column. */
  expand?: (row: T) => any
  /** inline (default): they slide open in place at every width. sheet: a panel over the table below 1000px. */
  details?: 'inline' | 'sheet'
  onEdit?: (row: T, column: string, value: any) => void
  /** The toolbar's own actions. */
  actions?: any
  /** The Columns disclosure. */
  picker?: boolean
  /** Columns hidden from the start, in the server's HTML too. Bind a State to keep what people choose. */
  hiddenColumns?: readonly string[] | State<readonly string[]>
  /** Forces a state; a Resource's own is used otherwise. */
  status?: TableStatus
  empty?: { title?: any; text?: any; action?: any }
  error?: { title?: any; text?: any }
  onRetry?: () => void
  maxHeight?: string
  /** The outline level of the table's state and sheet headings, under the page's h1. */
  heading?: number
}

export const chevron = () => <svg aria-hidden="true" focusable="false" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M6 3.5 10.5 8 6 12.5" /></svg>
export const sortIcon = () => <svg data-part="sort-icon" viewBox="0 0 10 10" aria-hidden="true"><path d="M5 1.5v7M2 5.5l3 3 3-3" fill="none" stroke="currentColor" stroke-width="1.4" /></svg>
export const columnsIcon = () => <ColumnsIcon />
const SKELETON_ROWS = 6
const CARDS_BELOW = 600 // table width: the phone cards' @container query, so the sort bar exists only there
const DETAILS_FROM = 1000 // table width: below it `details="sheet"` opens the sheet (06 §5)

const isResource = (r: any): r is Resource<any> => typeof r?.refresh === 'function'
const isState = (r: any): r is State<any> => r != null && !Array.isArray(r) && 'value' in r

type Ctx<T> = {
  id: string
  level: number
  cols: () => Column<T>[]
  keyOf: (row: T) => string
  read: (c: Column<T>, row: T) => any
  sel: State<Record<string, boolean>> | undefined
  open: State<Record<string, boolean>>
  details: boolean
  span: () => number
  title: (row: T) => string
  pick: (key: string, e: MouseEvent) => void
  toggle: (row: T, from: HTMLElement) => void
  body: (row: T) => any
  edit?: (row: T, column: string, value: any) => void
}

/** Every column as a list: what a sheet and a detail row show by default. */
function Fields<T>({ row, ctx }: { row: T; ctx: Ctx<T> }) {
  return <dl data-scope="desc">{ctx.cols().map(c => <div key={c.id}><dt>{c.header}</dt><dd>{(c.cell ?? ((r: T) => ctx.read(c, r)))(row)}</dd></div>)}</dl>
}

export function Editor({ label, start, onDone, onLeave, invalid, describedby }: { label: string; start: string; onDone: (save: boolean, text: string) => void; onLeave?: (save: boolean, text: string) => void; invalid?: boolean; describedby?: string }) {
  let input: HTMLInputElement | undefined
  onMount(() => { input?.focus(); input?.select() })
  return (
    <label>
      <span data-part="sr-only">{label}</span>
      <input
        ref={(n: any) => (input = n)}
        data-part="editor"
        aria-invalid={invalid ? 'true' : undefined}
        aria-describedby={describedby}
        value={start}
        onKeyDown={(e: KeyboardEvent) => {
          if (e.key !== 'Enter' && e.key !== 'Escape') return
          e.preventDefault()
          e.stopPropagation()
          onDone(e.key === 'Enter', (e.currentTarget as HTMLInputElement).value)
        }}
        onBlur={(e: FocusEvent) => (onLeave ?? onDone)(true, (e.currentTarget as HTMLInputElement).value)}
      />
    </label>
  )
}

// its own component: a new value patches this one text node, and flipping `editing` is the only thing that swaps it
function Shown<T>({ row, col, value }: { row: T; col: Column<T>; value: () => any }) {
  const c = untrack(() => col)
  if (c.live) return <><span data-part="dir" aria-hidden="true"></span>{c.cell ? c.cell(row) : value()}</>
  return <>{c.cell ? c.cell(row) : value()}</>
}

function Cell<T>({ row, col, ctx }: { row: T; col: Column<T>; ctx: Ctx<T> }) {
  const c = untrack(() => col)
  const editing = state(false)
  const problem = state('')
  const delta = state<string | undefined>(undefined)
  const message = () => `${ctx.id}-${ctx.keyOf(row)}-${c.id}-e`
  const value = () => ctx.read(c, row)
  let td: HTMLElement | undefined
  if (c.live) watch(value, (now, was) => {
    if (was === undefined || now === was) return
    const dir = now > was ? 'up' : 'down'
    delta.value = delta.value === dir ? `${dir}2` : dir // two names per direction, so the flash replays
  })
  let seed = ''
  const begin = () => { if (c.edit && !editing.value) { seed = String(untrack(value) ?? ''); problem.value = ''; editing.value = true } }
  const done = (save: boolean, text: string) => {
    if (!editing.value) return
    if (save) {
      const next = typeof c.edit === 'function' ? c.edit(text) : text
      const ok = c.validate?.(next) ?? true
      if (ok !== true) { problem.value = typeof ok === 'string' ? ok : 'That value is not valid'; return }
      ctx.edit?.(row, c.id, next)
    }
    problem.value = ''
    editing.value = false
    td?.focus()
  }
  return (
    <td
      ref={(n: any) => (td = n)}
      role={c.rowHeader ? 'rowheader' : 'cell'}
      data-col={c.id}
      data-label={c.header}
      data-numeric={c.numeric ? '' : undefined}
      data-priority={c.priority}
      data-card={c.card}
      data-pinned={c.pin ? 'last' : undefined}
      data-live={c.live ? '' : undefined}
      data-delta={delta.value}
      data-editable={c.edit ? '' : undefined}
      data-invalid={problem.value ? '' : undefined}
      tabindex={c.edit ? '0' : undefined}
      aria-description={c.edit ? 'Press Enter to edit' : undefined}
      onDblClick={c.edit ? begin : undefined}
      onKeyDown={c.edit ? (e: KeyboardEvent) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === 'F2')) { e.preventDefault(); begin() } } : undefined}
    >
      {editing.value
        ? <><Editor label={`${c.header} for ${ctx.title(row)}`} start={seed} onDone={done} />{problem.value && <span data-part="sr-only" id={message()} role="alert">{problem.value}</span>}</>
        : <Shown row={row} col={c} value={value} />}
    </td>
  )
}

function Row<T>({ row, ctx }: { row: T; ctx: Ctx<T> }) {
  const key = () => ctx.keyOf(row)
  const on = () => !!ctx.sel?.get(key())
  const opened = () => !!ctx.open.get(key())
  const detail = () => `${ctx.id}-d-${key()}`
  // a closing row stays until it has slid shut. A timer, because transitionend never comes
  // when the transition is skipped, and that would strand an empty row
  const mounted = state(untrack(opened))
  let tr: HTMLElement | undefined
  const settle = () => { if (!untrack(opened)) mounted.value = false }
  watch(opened, on => {
    if (on) return void (mounted.value = true)
    if (!mounted.value) return
    queueMicrotask(() => {
      const slide = tr?.nextElementSibling?.querySelector('[data-part="slide"]')
      setTimeout(settle, slide ? parseFloat(getComputedStyle(slide).transitionDuration) * 1000 : 0)
    })
  })
  const click = (e: MouseEvent) => {
    if ((e.target as Element).closest('button, input, select, a, label, [data-editable]')) return
    ctx.toggle(row, (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-part="expand"]')!)
  }
  return (
    <>
      <tr ref={(n: any) => (tr = n)} role="row" data-id={key()} data-selected={on() ? '' : undefined} data-clickable={ctx.details ? '' : undefined} onClick={ctx.details ? click : undefined}>
        {ctx.sel && <td role="cell" data-part="select" data-pinned="first"><label data-scope="checkbox"><input type="checkbox" checked={ctx.sel.get(key())} aria-label={`Select ${ctx.title(row)}`} onClick={(e: MouseEvent) => ctx.pick(key(), e)} /><span data-part="control"><svg viewBox="0 0 24 24" aria-hidden="true"><path data-part="check" pathLength="1" d="M5 12.5 L9.5 17 L19 7" /></svg></span></label></td>}
        {ctx.details && <td role="cell" style="padding-inline:4px"><button type="button" data-part="expand" aria-expanded={opened() ? 'true' : 'false'} aria-controls={mounted.value ? detail() : undefined} aria-label={`Details for ${ctx.title(row)}`} onClick={(e: MouseEvent) => ctx.toggle(row, e.currentTarget as HTMLElement)}>{chevron()}</button></td>}
        {ctx.cols().map(c => <Cell key={c.id} row={row} col={c} ctx={ctx} />)}
      </tr>
      {mounted.value && <tr data-part="detail" role="row" id={detail()}><td role="cell" colspan={ctx.span()}><div data-part="slide" data-closing={opened() ? undefined : ''}><div><div>{ctx.body(row)}</div></div></div></td></tr>}
    </>
  )
}

/** The tablet detail sheet (06 §5): non-modal, Escape closes it from anywhere, focus moves to Close and back to the row. */
function Sheet<T>({ row, ctx, onClose }: { row: T; ctx: Ctx<T>; onClose: (restore?: boolean) => void }) {
  let close: HTMLElement | undefined
  let el: HTMLElement | undefined
  onMount(() => {
    close?.focus()
    onCleanup(pushLayer({ el: el!, close: reason => onClose(reason === 'escape') }))
  })
  const id = () => `${ctx.id}-sh`
  return (
    <div ref={(n: any) => (el = n)} data-part="sheet" role="dialog" aria-modal="false" aria-labelledby={id()}>
      <header>
        <h4 id={id()} aria-level={ctx.level} style="margin:0">{ctx.title(row)}</h4>
        <Button emphasis="ghost" tone="neutral" ref={(n: any) => (close = n)} onClick={() => onClose(true)}>Close</Button>
      </header>
      <div tabindex="0" role="group" aria-labelledby={id()}>{ctx.body(row)}</div>
    </div>
  )
}

export function ColumnsPanel<T>({ id, open, trigger, items, shown, flip }: { id: string; open: State<boolean>; trigger: () => HTMLElement; items: Column<T>[]; shown: (c: Column<T>) => boolean; flip: (c: Column<T>, shown: boolean) => void }) {
  let panel: HTMLDivElement | undefined
  use(popover, () => panel, () => ({ open: open.value, trigger: trigger(), side: 'bottom' as const, align: 'end' as const, onClose: () => (open.value = false) }))
  return (
    <div ref={(n: any) => (panel = n)} data-scope="popover" data-part="content" popover="manual" id={id} role="group" aria-label="Visible columns">
      {items.map(c => <div key={c.id}><Checkbox checked={shown(c)} onChange={(e: any) => flip(c, e.currentTarget.checked)}>{c.header}</Checkbox></div>)}
    </div>
  )
}

/**
 * A data table (06 §5; data.html:1095-1124): a semantic <table> with explicit ARIA roles, so they survive the phone
 * cards' display change. Sort, filter, Columns, resize, pin, selection with a bulk bar, details, inline edit and live
 * cells, in the states ready, loading, empty and error, inside one frame. Rows are keyed: a sort moves nodes, a new
 * value patches a cell. Given `T[]` it sorts, filters and pages by itself; a Resource or `server` leaves that to the
 * server and reports what was asked. Queries its own width, never the window.
 */
export function Table<T>({ rows, caption, captionHidden, columns, rowKey = 'id', phone = 'cards', density, filter, query, sort, onSortChange, server, selection, onSelectionChange, bulk, page, onPageChange, expand, details = 'inline', onEdit, actions, picker = true, hiddenColumns, status, empty, error, onRetry, maxHeight, heading = 2 }: TableProps<T>) {
  const id = uid('tbl')
  const level = untrack(() => heading)
  const cols = derived(() => columns)
  const keyOf = (r: T) => String(typeof rowKey === 'function' ? rowKey(r) : (r as any)[rowKey])
  const read = (c: Column<T>, r: T) => (c.value ? c.value(r) : (r as any)[c.id])
  const named = derived(() => cols.value.find(c => c.rowHeader) ?? cols.value[0])
  const title = (r: T) => String(read(named.value, r) ?? '')

  const typed = untrack(() => query) ?? state('')
  const order = untrack(() => sort) ?? state<TableSort | undefined>(undefined)
  const given = untrack(() => selection)
  const sel = given ? (given === true ? state<Record<string, boolean>>({}) : given) : undefined
  const open = state<Record<string, boolean>>({})
  const startHidden = untrack(() => hiddenColumns)
  const hidden: State<readonly string[]> = isState(startHidden) ? startHidden : state<readonly string[]>(startHidden ?? [])
  const at = state(0)
  const sheet = state<{ row: T; from: HTMLElement } | undefined>(undefined)
  const narrow = () => (el?.clientWidth ?? DETAILS_FROM) < DETAILS_FROM
  let anchor: string | undefined
  let el: HTMLDivElement | undefined
  let columnsButton: HTMLElement | undefined
  const picking = state(false)
  // the panel is built on first open and kept, so a closed table carries none of its checkboxes
  const picked = state(false)
  const small = state(false)

  const source = () => { const r: any = rows; return isResource(r) ? r.value : isState(r) ? r.value : r }
  const remote = derived(() => !!server || isResource(rows))
  const list = derived<readonly T[]>(() => { const v: any = source(); return Array.isArray(v) ? v : v?.items ?? [] })
  const envelope = derived<ListPage<T> | undefined>(() => { const v: any = source(); return v && !Array.isArray(v) ? v : undefined })
  const shown = derived(() => {
    if (remote.value) return list.value
    const c = cols.value
    const found = filterRows(list.value, typed.value, r => c.map(x => read(x, r)))
    const s = order.value
    const by = s && c.find(x => x.id === s.id)
    if (!s || !by) return found
    return sortRows(found, typeof by.sort === 'function' ? by.sort : r => read(by, r), s.dir)
  })
  const paged = derived(() => {
    const size = page?.size
    return size && !remote.value ? pageSlice(shown.value, at.value, size) : undefined
  })
  const visible = derived(() => paged.value?.rows ?? shown.value)
  const phase = derived<TableStatus>(() => {
    if (status) return status
    const r: any = rows
    if (isResource(r)) {
      if (r.error) return 'error'
      if (r.value === undefined) return 'loading'
    }
    return visible.value.length ? 'ready' : 'empty'
  })
  watch(() => typed.value, (_, was) => { if (was !== undefined) at.value = 0 })

  const keys = derived(() => visible.value.map(keyOf))
  const chosen = () => Object.keys(sel!.value).filter(k => sel!.value[k])
  const write = (next: Record<string, boolean>) => { sel!.value = next; onSelectionChange?.(Object.keys(next).filter(k => next[k])) }
  const pick = (key: string, e: MouseEvent) => {
    const next = { ...sel!.value }
    if (e.shiftKey && anchor !== undefined) for (const k of rangeOf(keys.value, anchor, key)) next[k] = true
    else if (next[key]) delete next[key]
    else next[key] = true
    anchor = key
    write(next)
  }
  const headerCheck = derived(() => (sel ? checkState(keys.value, k => !!sel.get(k)) : 'none'))
  const pickAll = () => {
    const next = { ...sel!.value }
    const off = headerCheck.value === 'all'
    for (const k of keys.value) { if (off) delete next[k]; else next[k] = true }
    write(next)
  }

  const askSort = (c: Column<T>, dir?: SortDir) => {
    const now = order.value
    const next = { id: c.id, dir: dir ?? (now?.id === c.id && now.dir === 'ascending' ? 'descending' : 'ascending') } as TableSort
    order.value = next
    onSortChange?.(next)
  }
  const sortable = derived(() => cols.value.filter(c => c.sort))

  const hasDetails = untrack(() => expand !== undefined || columns.some(c => c.priority))
  const toggle = (row: T, from: HTMLElement) => {
    if (details === 'sheet' && narrow()) { sheet.value = { row, from }; return }
    const k = keyOf(row)
    const next = { ...open.value }
    if (next[k]) delete next[k]
    else next[k] = true
    open.value = next
  }
  const closeSheet = (restore?: boolean) => { const from = sheet.value?.from; sheet.value = undefined; if (restore) from?.focus() }

  const ctx: Ctx<T> = {
    id, level, cols: () => cols.value, keyOf, read, sel, open, details: hasDetails, title, pick, toggle,
    span: () => cols.value.length + (sel ? 1 : 0) + (hasDetails ? 1 : 0),
    body: row => (expand ? expand(row) : <Fields row={row} ctx={ctx} />),
    edit: (r, c, v) => onEdit?.(r, c, v),
  }

  const go = (reason: 'next' | 'prev') => {
    if (remote.value) return onPageChange?.(reason === 'next' ? envelope.value?.next : envelope.value?.prev, reason)
    at.value = paged.value!.page + (reason === 'next' ? 1 : -1)
    onPageChange?.(at.value, reason)
  }
  const hasPrev = derived(() => phase.value === 'ready' && (remote.value ? envelope.value?.prev != null : (paged.value?.page ?? 0) > 0))
  const hasNext = derived(() => phase.value === 'ready' && (remote.value ? envelope.value?.next != null : !!paged.value && paged.value.page < paged.value.pages - 1))
  const range = derived(() => {
    if (phase.value !== 'ready') return ''
    const p = paged.value
    if (p) return `${p.from}–${p.to} of ${shown.value.length}`
    const total = envelope.value?.total
    return total === undefined ? '' : `${visible.value.length} of ${total}`
  })
  const count = derived(() => (phase.value === 'ready' && !remote.value ? `${shown.value.length} of ${list.value.length}` : ''))
  const footer = derived(() => page !== undefined || isResource(rows))

  const retry = () => { onRetry?.(); const r: any = rows; if (isResource(r)) r.refresh() }
  const clear = () => (typed.value = '')
  const noticeTitle = derived(() => (phase.value === 'error' ? error?.title ?? 'This couldn’t load' : typed.value ? `No rows match “${typed.value}”` : empty?.title ?? 'Nothing here yet'))
  const noticeText = derived(() => {
    if (phase.value === 'error') { const r: any = rows; return error?.text ?? (isResource(r) && r.error instanceof Error ? r.error.message : 'Try again in a moment.') }
    return typed.value ? 'Try a shorter term, or clear the filter.' : empty?.text
  })

  use(table, () => el, () => ({ hidden: hidden.value, rows: visible.value, onWidth: w => (small.value = w < CARDS_BELOW) }))
  onCleanup(() => (sheet.value = undefined))

  const toolbar = derived(() => filter !== undefined || actions !== undefined || !!picker)
  const hideable = derived(() => cols.value.filter(c => !c.pin))
  const flip = (c: Column<T>, shown: boolean) => { hidden.value = shown ? hidden.value.filter(x => x !== c.id) : [...hidden.value, c.id] }
  return (
    <div ref={(n: any) => (el = n)} data-scope="table" data-phone={phone} data-state={phase.value} data-density={density} id={id}>
      {untrack(() => hidden.value.length > 0) && <style data-part="hide" innerHTML={untrack(() => hideRule(id, hidden.value))}></style>}
      {toolbar.value && (
        <div data-part="toolbar">
          {filter !== undefined && <Search label={filter} value={typed.value} onInput={(e: any) => (typed.value = e.currentTarget.value)} />}
          <span data-part="count" aria-live="polite">{count.value}</span>
          <span data-part="spacer"></span>
          {actions}
          {picker && (
            <div>
              <Button emphasis="outline" tone="neutral" ref={(n: any) => (columnsButton = n)} aria-expanded={picking.value ? 'true' : 'false'} aria-controls={picked.value ? `${id}-cols` : undefined} onClick={() => { picked.value = true; picking.value = !picking.value }}>{columnsIcon()}Columns</Button>
              {picked.value && <ColumnsPanel id={`${id}-cols`} open={picking} trigger={() => columnsButton!} items={hideable.value} shown={c => !hidden.value.includes(c.id)} flip={flip} />}
            </div>
          )}
        </div>
      )}
      {sel && (
        <div data-part="bulk" hidden={chosen().length === 0} role="region" aria-label="Bulk actions">
          <b>{chosen().length} selected</b>
          {bulk?.(chosen())}
          <Button emphasis="ghost" onClick={() => write({})}>Clear</Button>
        </div>
      )}
      {phone === 'cards' && small.value && sortable.value.length > 0 && (
        <div data-part="sortbar">
          <Select label="Sort by" size="sm" value={order.value?.id ?? ''} placeholder="None" options={sortable.value.map(c => ({ value: c.id, label: c.header }))} onChange={(e: any) => { const c = cols.value.find(x => x.id === e.currentTarget.value); if (c) askSort(c, order.value?.dir ?? 'ascending') }} />
          <Button emphasis="outline" tone="neutral" size="sm" aria-label="Toggle sort direction" disabled={!order.value} onClick={() => { const c = cols.value.find(x => x.id === order.value?.id); if (c) askSort(c, order.value!.dir === 'ascending' ? 'descending' : 'ascending') }}>{order.value?.dir === 'ascending' ? '↑' : '↓'}</Button>
        </div>
      )}
      <div data-part="viewport" style={maxHeight ? `--warp-table-max-h:${maxHeight}` : undefined}>
        <table role="table" aria-labelledby={`${id}-cap`} aria-rowcount={shown.value.length + 1}>
          <caption id={`${id}-cap`} data-part={captionHidden ? 'sr-only' : undefined}>{caption}</caption>
          <thead>
            <tr role="row">
              {sel && <th role="columnheader" scope="col" data-part="select" data-pinned="first"><Checkbox checked={headerCheck.value === 'all'} indeterminate={headerCheck.value === 'some'} aria-label="Select all rows on this page" onClick={pickAll} /></th>}
              {hasDetails && <th role="columnheader" scope="col" style="inline-size:1px;padding-inline:4px"><span data-part="sr-only">Details</span></th>}
              {cols.value.map(c => (
                <th
                  key={c.id}
                  role="columnheader"
                  scope="col"
                  data-col={c.id}
                  data-numeric={c.numeric ? '' : undefined}
                  data-priority={c.priority}
                  data-pinned={c.pin ? 'last' : undefined}
                  aria-sort={order.value?.id === c.id ? order.value.dir : undefined}
                >
                  {c.sort ? <button type="button" data-part="sort" onClick={() => askSort(c)}>{c.header}{sortIcon()}</button> : c.header}
                  {c.resize && <span data-part="resize" role="separator" aria-orientation="vertical" tabindex="0" aria-label={`Resize ${c.header} column`} aria-valuenow="80" aria-valuemin="80" aria-valuemax="480"></span>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody aria-busy={phase.value === 'loading' ? 'true' : undefined}>
            {phase.value === 'loading'
              ? Array.from({ length: SKELETON_ROWS }, (_, n) => n).map(n => (
                <tr key={n} role="row">
                  {sel && <td role="cell" data-part="select"></td>}
                  {hasDetails && <td role="cell"></td>}
                  {cols.value.map(c => <td key={c.id} role="cell" data-col={c.id} data-priority={c.priority}><span data-part="skeleton" style={`--w:${30 + ((n * 17 + c.id.length * 9) % 55)}%`}></span></td>)}
                </tr>
              ))
              : phase.value === 'ready'
                ? visible.value.map(r => <Row key={keyOf(r)} row={r} ctx={ctx} />)
                : (
                  <tr role="row">
                    <td role="cell" colspan={ctx.span()} style="white-space:normal;block-size:auto">
                      <div data-part="state" data-kind={phase.value} role={phase.value === 'error' ? 'alert' : 'status'}>
                        <svg viewBox="0 0 72 40" aria-hidden="true"><line x1="8" y1="0" x2="8" y2="40" /><line x1="22" y1="0" x2="22" y2="40" /><line x1="36" y1="0" x2="36" y2="40" /><line x1="50" y1="0" x2="50" y2="40" /><line x1="64" y1="0" x2="64" y2="40" /><path d={phase.value === 'error' ? 'M0 20H30' : 'M0 14H72M0 26H72'} /></svg>
                        <h4 aria-level={level}>{noticeTitle.value}</h4>
                        <p>{noticeText.value}</p>
                        {phase.value === 'error'
                          ? <Button emphasis="outline" tone="neutral" onClick={retry}>Retry</Button>
                          : typed.value ? <Button emphasis="outline" tone="neutral" onClick={clear}>Clear filter</Button> : empty?.action}
                      </div>
                    </td>
                  </tr>
                )}
          </tbody>
        </table>
      </div>
      {footer.value && (
        <div data-part="footer">
          <span>{range.value}</span>
          <div style="display:flex;gap:8px">
            <Button emphasis="outline" tone="neutral" size="sm" disabled={!hasPrev.value} onClick={() => go('prev')}>Previous</Button>
            <Button emphasis="outline" tone="neutral" size="sm" disabled={!hasNext.value} onClick={() => go('next')}>Next</Button>
          </div>
        </div>
      )}
      {sheet.value && <Sheet row={sheet.value.row} ctx={ctx} onClose={closeSheet} />}
    </div>
  )
}
