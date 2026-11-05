// Table rows, editable cells and the detail sheet.
import { pushLayer } from '@weft-js/warp-core'
import { onCleanup, onMount, state, untrack, watch, type State } from '@weft-js/core'
import { Button } from './Button'
import type { Column, Ctx } from './Table-types'

/** The details disclosure icon. */
export const chevron = () => (
  <svg
    aria-hidden="true"
    focusable="false"
    viewBox="0 0 16 16"
    fill="none"
    stroke="currentColor"
    stroke-width="1.5"
  >
    <path d="M6 3.5 10.5 8 6 12.5" />
  </svg>
)
/** Every column as a list: what a sheet and a detail row show by default. */
export function Fields<T>({ row, ctx }: { row: T; ctx: Ctx<T> }) {
  return (
    <dl data-scope="desc">
      {ctx.cols().map((c) => (
        <div key={c.id}>
          <dt>{c.header}</dt>
          <dd>{(c.cell ?? ((r: T) => ctx.read(c, r)))(row)}</dd>
        </div>
      ))}
    </dl>
  )
}

/** The input used to edit a cell. */
export function Editor({
  label,
  start,
  onDone,
  onLeave,
  invalid,
  describedby,
}: {
  label: string
  start: string
  onDone: (save: boolean, text: string) => void
  onLeave?: (save: boolean, text: string) => void
  invalid?: boolean
  describedby?: string | undefined
}) {
  let input: HTMLInputElement | undefined
  onMount(() => {
    input?.focus()
    input?.select()
  })
  return (
    <label>
      <span data-part="sr-only">{label}</span>
      <input
        ref={(n) => (input = n)}
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
        onBlur={(e: FocusEvent) =>
          (onLeave ?? onDone)(true, (e.currentTarget as HTMLInputElement).value)
        }
      />
    </label>
  )
}

// its own component: a new value patches this one text node, and flipping `editing` is the only thing that swaps it
function Shown<T>({ row, col, value }: { row: T; col: Column<T>; value: () => unknown }) {
  const c = untrack(() => col)
  if (c.live)
    return (
      <>
        <span data-part="dir" aria-hidden="true"></span>
        {c.cell ? c.cell(row) : value()}
      </>
    )
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
  if (c.live)
    watch(value, (now, was) => {
      if (was === undefined || now === was) return
      const dir = (now as number) > (was as number) ? 'up' : 'down'
      delta.value = delta.value === dir ? `${dir}2` : dir // two names per direction, so the flash replays
    })
  let seed = ''
  const begin = () => {
    if (c.edit && !editing.value) {
      seed = String((untrack(value) as string | number | null | undefined) ?? '')
      problem.value = ''
      editing.value = true
    }
  }
  const done = (save: boolean, text: string) => {
    if (!editing.value) return
    if (save) {
      const next = typeof c.edit === 'function' ? c.edit(text) : text
      const ok = c.validate?.(next) ?? true
      if (ok !== true) {
        problem.value = typeof ok === 'string' ? ok : 'That value is not valid'
        return
      }
      ctx.edit?.(row, c.id, next)
    }
    problem.value = ''
    editing.value = false
    td?.focus()
  }
  return (
    <td
      ref={(n) => (td = n)}
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
      onKeyDown={
        (c.edit
          ? (e: KeyboardEvent) => {
              if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === 'F2')) {
                e.preventDefault()
                begin()
              }
            }
          : undefined)!
      }
    >
      {editing.value ? (
        <>
          <Editor label={`${c.header} for ${ctx.title(row)}`} start={seed} onDone={done} />
          {problem.value && (
            <span data-part="sr-only" id={message()} role="alert">
              {problem.value}
            </span>
          )}
        </>
      ) : (
        <Shown row={row} col={c} value={value} />
      )}
    </td>
  )
}

export function Row<T>({ row, ctx }: { row: T; ctx: Ctx<T> }) {
  const key = () => ctx.keyOf(row)
  const on = () => !!ctx.sel?.get(key())
  const opened = () => !!(ctx.open.get(key()) as boolean | undefined)
  const detail = () => `${ctx.id}-d-${key()}`
  // a closing row stays until it has slid shut. A timer, because transitionend never comes
  // when the transition is skipped, and that would strand an empty row
  const mounted = state(untrack(opened))
  let tr: HTMLElement | undefined
  const settle = () => settleRow(opened, mounted)
  watch(opened, (now) => {
    if (now) return void (mounted.value = true)
    if (!mounted.value) return
    queueMicrotask(() => {
      const slide = tr?.nextElementSibling?.querySelector('[data-part="slide"]')
      setTimeout(settle, slide ? parseFloat(getComputedStyle(slide).transitionDuration) * 1000 : 0)
    })
  })
  const click = rowClick(
    () => row,
    () => ctx,
  )
  return (
    <>
      <tr
        ref={(n) => (tr = n)}
        role="row"
        data-id={key()}
        data-selected={on() ? '' : undefined}
        data-clickable={ctx.details ? '' : undefined}
        onClick={(ctx.details ? click : undefined)!}
      >
        {ctx.sel && (
          <td role="cell" data-part="select" data-pinned="first">
            <label data-scope="checkbox">
              <input
                type="checkbox"
                checked={ctx.sel.get(key())}
                aria-label={`Select ${ctx.title(row)}`}
                onClick={(e: MouseEvent) => ctx.pick(key(), e)}
              />
              <span data-part="control">
                <span data-part="mark" aria-hidden="true"></span>
              </span>
            </label>
          </td>
        )}
        {ctx.details && (
          <td role="cell" style="padding-inline:4px">
            <button
              type="button"
              data-part="expand"
              aria-expanded={opened() ? 'true' : 'false'}
              aria-controls={mounted.value ? detail() : undefined}
              aria-label={`Details for ${ctx.title(row)}`}
              onClick={(e: MouseEvent) => ctx.toggle(row, e.currentTarget as HTMLElement)}
            >
              {chevron()}
            </button>
          </td>
        )}
        {ctx.cols().map((c) => (
          <Cell key={c.id} row={row} col={c} ctx={ctx} />
        ))}
      </tr>
      {mounted.value && (
        <tr data-part="detail" role="row" id={detail()}>
          <td role="cell" colspan={ctx.span()}>
            <div data-part="slide" data-closing={opened() ? undefined : ''}>
              <div>
                <div>{ctx.body(row)}</div>
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
  )
}

function settleRow(opened: () => boolean, mounted: State<boolean>) {
  if (!untrack(opened)) mounted.value = false
}

function rowClick<T>(row: () => T, ctx: () => Ctx<T>) {
  return (e: MouseEvent) => {
    if ((e.target as Element).closest?.('button, input, select, a, label, [data-editable]')) return
    ctx().toggle(
      row(),
      (e.currentTarget as HTMLElement).querySelector<HTMLElement>('[data-part="expand"]')!,
    )
  }
}

/** The tablet detail sheet (06 §5): non-modal, Escape closes it from anywhere, focus moves to Close and back to the row. */
export function Sheet<T>({
  row,
  ctx,
  onClose,
}: {
  row: T
  ctx: Ctx<T>
  onClose: (restore?: boolean) => void
}) {
  let close: HTMLElement | undefined
  let el: HTMLElement | undefined
  onMount(() => {
    close?.focus()
    onCleanup(pushLayer({ el: el!, close: (reason) => onClose(reason === 'escape') }))
  })
  const id = () => `${ctx.id}-sh`
  return (
    <div
      ref={(n) => (el = n)}
      data-part="sheet"
      role="dialog"
      aria-modal="false"
      aria-labelledby={id()}
    >
      <header>
        <h4 id={id()} aria-level={ctx.level} style="margin:0">
          {ctx.title(row)}
        </h4>
        <Button
          emphasis="ghost"
          tone="neutral"
          ref={(n) => (close = n)}
          onClick={() => onClose(true)}
        >
          Close
        </Button>
      </header>
      <div tabindex="0" role="group" aria-labelledby={id()}>
        {ctx.body(row)}
      </div>
    </div>
  )
}
