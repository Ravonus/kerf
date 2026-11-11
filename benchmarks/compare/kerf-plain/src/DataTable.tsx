import { derived, state, untrack, watch } from '@kerf/core'
import { money, pageSize, projects, type Project } from '../../shared/data'

export type Column = { id: keyof Project; header: string; cell?: (r: Project) => any }
type Flags = ReturnType<typeof state<Record<string, boolean>>>
type Ctx = { cols: () => Column[]; sel: Flags; open: Flags; span: () => number }

function Row({ row, ctx }: { row: Project; ctx: Ctx }) {
  const opened = () => !!ctx.open.get(row.id)
  const mounted = state(untrack(opened))
  watch(opened, (on) => {
    if (on) mounted.value = true
    else
      setTimeout(() => {
        if (!untrack(opened)) mounted.value = false
      }, 300)
  })
  const flip = (flags: Flags) => (flags.value = { ...flags.value, [row.id]: !flags.value[row.id] })
  return (
    <>
      <tr data-selected={ctx.sel.get(row.id) ? '' : undefined}>
        <td>
          <input
            type="checkbox"
            class="check"
            aria-label={`Select ${row.name}`}
            checked={ctx.sel.get(row.id)}
            onClick={() => flip(ctx.sel)}
          />
        </td>
        <td>
          <button
            aria-label={`Details for ${row.name}`}
            aria-expanded={opened() ? 'true' : 'false'}
            onClick={() => flip(ctx.open)}
          >
            {opened() ? '▾' : '▸'}
          </button>
        </td>
        {ctx.cols().map((c) => (
          <td key={c.id} data-label={c.header}>
            {c.cell ? c.cell(row) : row[c.id]}
          </td>
        ))}
      </tr>
      {mounted.value && (
        <tr>
          <td colspan={ctx.span()}>
            <div class="slide" data-closing={opened() ? undefined : ''}>
              <div>
                <dl class="facts">
                  <dt>Owner</dt>
                  <dd>{row.owner}</dd>
                  <dt>Region</dt>
                  <dd>{row.region}</dd>
                  <dt>Budget</dt>
                  <dd>{money(row.budget)}</dd>
                </dl>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function tableState(columns: () => Column[]) {
  const data = state(projects)
  ;(window as any).__tick = () =>
    (data.value = data.value.map((r) => (r.id === 'p0' ? { ...r, budget: r.budget + 1 } : r)))
  const sel = state<Record<string, boolean>>({}),
    open = state<Record<string, boolean>>({})
  const hidden = state<Record<string, boolean>>({})
  const typed = state(''),
    at = state(0)
  const order = state<{ id: keyof Project; dir: 1 | -1 } | null>(null)
  const found = derived(() => {
    const q = typed.value.toLowerCase()
    return q
      ? data.value.filter((r) => columns().some((c) => String(r[c.id]).toLowerCase().includes(q)))
      : data.value
  })
  const sorted = derived(() => {
    const o = order.value
    if (!o) return found.value
    return [...found.value].sort((a, b) =>
      a[o.id] < b[o.id] ? -o.dir : a[o.id] > b[o.id] ? o.dir : 0,
    )
  })
  const shown = derived(() => sorted.value.slice(at.value * pageSize, (at.value + 1) * pageSize))
  const cols = derived(() => columns().filter((c) => !hidden.value[c.id]))
  const picked = derived(() => Object.values(sel.value).filter(Boolean).length)
  const all = derived(() => shown.value.every((r) => sel.get(r.id)))
  const pages = derived(() => Math.ceil(found.value.length / pageSize))
  const ctx: Ctx = { cols: () => cols.value, sel, open, span: () => cols.value.length + 2 }
  const flip = (id: keyof Project) => {
    const o = order.value
    order.value = { id, dir: o?.id === id && o.dir === 1 ? -1 : 1 }
    at.value = 0
  }
  const pickAll = () => {
    const next = { ...sel.value },
      on = !all.value
    for (const r of shown.value) next[r.id] = on
    sel.value = next
  }
  const onFilter = (e: any) => {
    typed.value = e.currentTarget.value
    at.value = 0
  }
  return {
    data,
    hidden,
    typed,
    at,
    order,
    found,
    shown,
    cols,
    picked,
    all,
    pages,
    ctx,
    flip,
    pickAll,
    onFilter,
  }
}

function columnItems(columns: Column[], hidden: Flags) {
  return columns.map((c) => (
    <label key={c.id} class="item">
      <input
        type="checkbox"
        checked={!hidden.get(c.id)}
        onChange={() => (hidden.value = { ...hidden.value, [c.id]: !hidden.value[c.id] })}
      />
      {c.header}
    </label>
  ))
}

function columnHeaders(
  cols: ReturnType<typeof tableState>['cols'],
  order: ReturnType<typeof tableState>['order'],
  flip: ReturnType<typeof tableState>['flip'],
) {
  return cols.value.map((c) => (
    <th
      key={c.id}
      aria-sort={
        order.value?.id === c.id ? (order.value.dir === 1 ? 'ascending' : 'descending') : 'none'
      }
    >
      <button class="sort" onClick={() => flip(c.id)}>
        {c.header}
      </button>
    </th>
  ))
}

export function DataTable({ label, columns }: { label: string; columns: Column[] }) {
  const {
    data,
    hidden,
    typed,
    at,
    order,
    found,
    shown,
    cols,
    picked,
    all,
    pages,
    ctx,
    flip,
    pickAll,
    onFilter,
  } = tableState(() => columns)
  return (
    <>
      <div class="tools">
        <input
          class="input"
          aria-label="Filter projects"
          placeholder="Filter projects"
          value={typed.value}
          onInput={onFilter}
        />
        <span role="status">
          {found.value.length} of {data.value.length}
        </span>
        {picked.value > 0 && <button class="btn">Archive {picked.value}</button>}
        <button class="btn push" popovertarget="columns">
          Columns
        </button>
        <div popover id="columns" class="pop">
          {columnItems(columns, hidden)}
        </div>
      </div>
      <div class="frame">
        <table class="grid">
          <caption class="sr">{label}</caption>
          <thead>
            <tr>
              <th class="narrow">
                <input
                  type="checkbox"
                  class="check"
                  aria-label="Select all"
                  checked={all.value}
                  onClick={pickAll}
                />
              </th>
              <th class="narrow"></th>
              {columnHeaders(cols, order, flip)}
            </tr>
          </thead>
          <tbody>
            {shown.value.map((r) => (
              <Row key={r.id} row={r} ctx={ctx} />
            ))}
          </tbody>
        </table>
      </div>
      <div class="pager">
        <span>
          {at.value * pageSize + 1}–{Math.min((at.value + 1) * pageSize, found.value.length)} of{' '}
          {found.value.length}
        </span>
        <button class="btn push" disabled={at.value === 0} onClick={() => (at.value -= 1)}>
          Previous
        </button>
        <button class="btn" disabled={at.value + 1 >= pages.value} onClick={() => (at.value += 1)}>
          Next
        </button>
      </div>
    </>
  )
}
