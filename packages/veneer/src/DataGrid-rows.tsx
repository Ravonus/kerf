// Grid rows and cells, shared by the grid's keyed rendering.
import { aggregate, type TreeEntry } from '@kerf/veneer-core'
import { derived, onCleanup, onMount, state, untrack, type State } from '@kerf/core'
import { chevron, Editor } from './Table'
import type { GridColumn, GridTree } from './DataGrid'

export type Line<T> =
  | {
      kind: 'row'
      id: string
      row: T
      tree?: TreeEntry<T> | undefined
      level?: number
      tint?: number | undefined
    }
  | { kind: 'group'; id: string; label: string; rows: T[]; open: boolean }
  | { kind: 'loading'; id: string; level: number; label: string; tint?: number | undefined }

export type Ctx<T> = {
  id: string
  cols: () => GridColumn<T>[]
  keyOf: (r: T) => string
  read: (c: GridColumn<T>, r: T) => unknown
  title: (r: T) => string
  treed: () => boolean
  tree?: GridTree<T> | undefined
  query: () => string
  rolled: (c: GridColumn<T>, r: T) => unknown
  kidsOf: (r: T) => readonly T[] | undefined
  commit: (r: T, c: string, v: unknown) => void
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
  body?: (r: T) => unknown
}

export const shownText = <T,>(c: GridColumn<T>, v: unknown) => (c.format ? c.format(v) : v)
export const total = <T,>(
  c: GridColumn<T>,
  rows: T[],
  read: (c: GridColumn<T>, r: T) => unknown,
) => {
  if (!c.aggregate) return ''
  const v =
    typeof c.aggregate === 'function'
      ? c.aggregate(rows)
      : aggregate(
          c.aggregate,
          rows.map((r) => read(c, r)),
        )
  return shownText(c, v)
}
function Hits({ text, query }: { text: string; query: string }) {
  const at = derived(() => (query ? text.toLowerCase().indexOf(query.toLowerCase()) : -1))
  return (
    <>
      {at.value < 0 ? (
        text
      ) : (
        <>
          {text.slice(0, at.value)}
          <mark data-part="hit">{text.slice(at.value, at.value + query.length)}</mark>
          {text.slice(at.value + query.length)}
        </>
      )}
    </>
  )
}

function gridEditor<T>(c: GridColumn<T>, row: () => T, ctx: () => Ctx<T>) {
  const editing = state(false)
  const problem = state('')
  let td: HTMLElement | undefined
  let seed = ''
  const begin = () => {
    if (!c.edit || editing.value) return
    seed = String((untrack(() => ctx().read(c, row())) as string | number | null | undefined) ?? '')
    problem.value = ''
    editing.value = true
  }
  onMount(() => {
    if (c.edit) {
      ctx().editors.set(td!, begin)
      onCleanup(() => ctx().editors.delete(td!))
    }
  })
  const done = (save: boolean, text: string) => {
    if (!editing.value) return
    if (save) {
      const next = typeof c.edit === 'function' ? c.edit(text) : text
      const ok = c.validate?.(next) ?? true
      if (ok !== true) {
        problem.value = typeof ok === 'string' ? ok : 'That value is not valid'
        ctx().status(problem.value)
        return
      }
      ctx().commit(row(), c.id, next)
    }
    problem.value = ''
    editing.value = false
    ctx().refocus()
  }
  const blur = (s: boolean, t: string) => {
    done(s, t)
    if (editing.value) {
      problem.value = ''
      editing.value = false
    }
  } // an invalid value left behind is dropped
  return {
    editing,
    problem,
    done,
    blur,
    get seed() {
      return seed
    },
    ref: (n: HTMLElement) => {
      td = n
    },
  }
}

function GridCell<T>({
  line,
  col,
  first,
  ctx,
}: {
  line: Extract<Line<T>, { kind: 'row' }>
  col: GridColumn<T>
  first: boolean
  ctx: Ctx<T>
}) {
  const c = untrack(() => col)
  const message = () => `${ctx.id}-${line.id}-${c.id}-e`
  const row = () => line.row
  const value = () => (line.tree?.branch ? ctx.rolled(c, row()) : ctx.read(c, row()))
  const editor = gridEditor(c, row, () => ctx)
  const { editing, problem, done, blur } = editor
  const body = () => (c.cell ? c.cell(row()) : shownText(c, value()))
  const treeCell = derived(() => line.tree !== undefined && first)
  const shown = derived(() => shownText(c, value()))
  return (
    <td
      ref={editor.ref}
      role={treeCell.value || c.rowHeader ? 'rowheader' : 'gridcell'}
      tabindex="-1"
      data-col={c.id}
      data-numeric={c.numeric ? '' : undefined}
      data-pinned={c.pin ? 'last' : undefined}
      data-editable={c.edit ? '' : undefined}
      data-invalid={problem.value ? '' : undefined}
      data-part={treeCell.value ? 'tree-cell' : undefined}
    >
      {editing.value ? (
        <>
          <Editor
            label={`${c.header} for ${ctx.title(row())}`}
            start={editor.seed}
            invalid={!!problem.value}
            describedby={problem.value ? message() : undefined}
            onDone={(save, text) => done(save, text)}
            onLeave={blur}
          />
          {problem.value && (
            <span data-part="sr-only" id={message()} role="alert">
              {problem.value}
            </span>
          )}
        </>
      ) : treeCell.value ? (
        <span data-part="tree-label">
          <span
            data-part="toggle"
            data-leaf={line.tree!.branch ? undefined : ''}
            aria-hidden="true"
            onClick={() => ctx.toggle(line.id)}
          >
            {chevron()}
          </span>
          <span data-part="primary">
            {c.cell ? body() : <Hits text={shown.value as string} query={ctx.query()} />}
          </span>
        </span>
      ) : (
        body()
      )}
    </td>
  )
}

export function GridRow<T>({
  line,
  ctx,
}: {
  line: Extract<Line<T>, { kind: 'row' }>
  ctx: Ctx<T>
}) {
  const open = () => !!(ctx.expanded.get(line.id) as boolean | undefined)
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
        style={
          line.level
            ? `--_lvl:${line.level}${line.tint ? `;--_bc:var(--veneer-color-data-${line.tint})` : ''}`
            : undefined
        }
      >
        {ctx.hasDetails && (
          <td role="gridcell" tabindex="-1" style="padding-inline:4px">
            <button
              type="button"
              tabindex="-1"
              data-part="expand"
              aria-expanded={open() ? 'true' : 'false'}
              aria-controls={open() ? detail() : undefined}
              aria-label={`Details for ${ctx.title(line.row)}`}
              onClick={() => ctx.flip(line.id)}
            >
              {chevron()}
            </button>
          </td>
        )}
        {ctx.cols().map((c, at) => (
          <GridCell key={c.id} line={line} col={c} first={at === 0} ctx={ctx} />
        ))}
      </tr>
      {open() && (
        <tr data-part="detail" role="row" id={detail()}>
          <td role="gridcell" colspan={ctx.span()}>
            <div data-part="slide">
              <div>
                <div>{ctx.body?.(line.row)}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

export function GroupRow<T>({
  line,
  ctx,
}: {
  line: Extract<Line<T>, { kind: 'group' }>
  ctx: Ctx<T>
}) {
  const sub = () => {
    const c = ctx.cols().find((x) => x.aggregate && x.aggregate !== 'count')
    const n = line.rows.length
    return `${n} ${n === 1 ? 'row' : 'rows'}${c ? ` · ${total(c, line.rows, ctx.read) as string}` : ''}`
  }
  return (
    <tr
      role="row"
      data-part="group"
      data-row={line.id}
      tabindex="-1"
      aria-level="1"
      aria-expanded={line.open ? 'true' : 'false'}
    >
      <td role="gridcell" tabindex="-1" colspan={ctx.span()}>
        <button
          type="button"
          tabindex="-1"
          aria-expanded={line.open ? 'true' : 'false'}
          onClick={() => ctx.toggle(line.id)}
        >
          {chevron()}
          <b>{line.label}</b> {sub()}
        </button>
      </td>
    </tr>
  )
}
