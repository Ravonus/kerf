import { comboPopup, uid } from '@kerf-js/veneer-core'
import { derived, flush, onCleanup, state, untrack, type State } from '@kerf-js/core'
import { Field, type FieldProps } from './Field'
import { Icon, type IconRef } from './Icon'
import { use } from '@kerf-js/veneer-core/kerf'
import '@kerf-js/veneer-core/styles/rich/listbox.css'
import '@kerf-js/veneer-core/styles/rich/popover.css'

export type ComboRow = {
  main: string
  sub?: string | undefined
  meta?: string | undefined
  icon?: IconRef | undefined
}

export type ComboFieldProps<T> = FieldProps & {
  /** The app's search. Superseded calls are aborted. */
  find: (q: string, signal: AbortSignal) => Promise<T[]>
  row: (hit: T) => ComboRow
  onPick: (hit: T) => unknown
  /** The text changed: by typing, or cleared by a second Esc. */
  onText?: (text: string) => void
  /** The search failed or took longer than `timeout` ms. */
  onFail?: () => void
  text: () => string
  minChars?: number
  timeout?: number
  /** Announced in the hint while there is no search running. */
  status?: () => string | undefined
}

type ComboEndContext = {
  id: string
  label: () => string
  rows: { readonly value: { at: number; r: ComboRow }[] }
  active: State<number>
  pick: (at: number) => void
  setPop: (el: HTMLDivElement) => void
}

function comboEnd(ctx: ComboEndContext) {
  return (
    <div
      ref={ctx.setPop}
      data-scope="popover"
      data-kind="combo"
      data-sweep=""
      popover="manual"
      role="presentation"
      onPointerDown={(e) => e.preventDefault()}
    >
      <span data-part="sweep" aria-hidden="true"></span>
      <ul data-part="listbox" role="listbox" id={ctx.id} aria-label={ctx.label()}>
        {ctx.rows.value.map(({ at, r }) => (
          <li
            key={`${at}:${r.main}`}
            role="option"
            id={`${ctx.id}-${at}`}
            aria-selected={at === ctx.active.value ? 'true' : 'false'}
            data-active={at === ctx.active.value ? '' : undefined}
            onClick={() => ctx.pick(at)}
          >
            {r.icon && <Icon name={r.icon} />}
            <span>
              {r.main}
              {r.sub && <small> {r.sub}</small>}
            </span>
            {r.meta && <span data-part="opt-meta">{r.meta}</span>}
          </li>
        ))}
      </ul>
    </div>
  )
}

type ComboOptions<T> = {
  find: (query: string, controller: AbortController) => Promise<T[]>
  row: () => ComboFieldProps<T>['row']
  onPick: (hit: () => T) => unknown
  onText: (text: string) => void
  onFail: () => void
  minChars: () => number
  timeout: () => number | undefined
  status: () => string | undefined
  hint: () => ComboFieldProps<T>['hint']
}

function comboSearch<T>({
  opts,
  hits,
  active,
  open,
  busy,
}: {
  opts: ComboOptions<T>
  hits: State<T[]>
  active: State<number>
  open: State<boolean>
  busy: State<boolean>
}) {
  let timer: ReturnType<typeof setTimeout> | undefined
  let stop: AbortController | undefined
  const cancel = () => {
    clearTimeout(timer)
    stop?.abort()
    stop = undefined
    busy.value = false
  }
  const run = (q: string) => {
    cancel()
    if (q.trim().length < opts.minChars()) {
      open.value = false
      hits.value = []
      return
    }
    // oxlint-disable-next-line typescript/no-misused-promises -- the body catches its own failure, and a sync wrapper would add a closure to a hot field
    timer = setTimeout(async () => {
      const me = (stop = new AbortController())
      busy.value = true
      const late = opts.timeout() ? setTimeout(() => me.abort(), opts.timeout()) : undefined
      try {
        const r = await opts.find(q, me)
        if (me !== stop) return
        hits.value = r
        active.value = 0
        open.value = r.length > 0
      } catch {
        if (me === stop || me.signal.aborted) {
          open.value = false
          opts.onFail()
        }
      } finally {
        clearTimeout(late)
        if (me === stop) busy.value = false
      }
    }, 120)
  }
  return { cancel, run }
}

function comboModel<T>(opts: ComboOptions<T>) {
  const id = uid('combo')
  const hits = state<T[]>([])
  const active = state(0)
  const open = state(false)
  const busy = state(false)
  const rows = derived(() => hits.value.map((hit, at) => ({ at, r: untrack(opts.row)(hit) })))
  let input: HTMLInputElement | undefined
  let pop: HTMLDivElement | undefined
  const { cancel, run } = comboSearch({ opts, hits, active, open, busy })
  onCleanup(cancel)
  use(
    comboPopup,
    () => pop,
    () => ({
      open: open.value,
      anchor: (input?.closest('[data-part="control"]') ?? input) as HTMLElement,
      onClose: () => (open.value = false),
    }),
  )
  const pick = (at: number) => {
    open.value = false
    opts.onPick(() => hits.value[at]!)
  }
  const onKey = (e: KeyboardEvent) => {
    const el = e.currentTarget as HTMLInputElement
    if (e.key === 'Escape') {
      if (e.defaultPrevented) return // an overlay took it: this popup, or the dialog around a closed one
      e.preventDefault()
      if (el.value) {
        cancel()
        opts.onText('')
      }
    } else if (e.key === 'ArrowDown' && !open.value) {
      e.preventDefault()
      run(el.value)
    } else if (open.value && hits.value.length) {
      const d = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key]
      if (d) {
        e.preventDefault()
        active.value = (active.value + d + hits.value.length) % hits.value.length
        flush()
        pop?.querySelector('[data-active]')?.scrollIntoView?.({ block: 'nearest' })
      } else if (e.key === 'Enter') {
        e.preventDefault()
        pick(active.value)
      }
    }
  }
  const shownHint = derived(() => (busy.value ? 'Searching…' : (opts.status() ?? opts.hint())))
  return [
    id,
    hits,
    active,
    open,
    busy,
    rows,
    run,
    pick,
    onKey,
    shownHint,
    (n: HTMLInputElement) => (input = n),
    (n: HTMLDivElement) => (pop = n),
  ] as const
}

/**
 * A text field with a list popup (04 §3, APG Combobox, list autocomplete with automatic selection): focus stays in the
 * input. Typing `minChars` opens the list with the first result active, ↓/↑ wrap, Enter picks, Esc closes and keeps the
 * text, a second Esc clears it, ↓ on a closed combobox searches again. Requests are debounced 120ms and aborted when
 * superseded. Shared by PlaceLookupInput and AddressField's line 1.
 */
export function ComboField<T>({
  find,
  row,
  onPick,
  onText,
  onFail,
  text,
  minChars = 2,
  timeout,
  status,
  hint,
  ...rest
}: ComboFieldProps<T>) {
  const [id, hits, active, open, busy, rows, run, pick, onKey, shownHint, setInput, setPop] =
    comboModel({
      find: (query, controller) => find(query.trim(), controller.signal),
      row: () => row,
      onPick: (hit) => onPick(hit()),
      onText: (value) => onText?.(value),
      onFail: () => onFail?.(),
      minChars: () => minChars,
      timeout: () => timeout,
      status: () => status?.(),
      hint: () => hint,
    })
  return (
    <Field
      {...rest}
      hint={shownHint.value}
      filled={text().length > 0}
      hold={open.value}
      control={(p) => (
        <input
          ref={setInput}
          {...p.rest}
          data-part="input"
          id={p.id}
          placeholder=" "
          role="combobox"
          aria-autocomplete="list"
          aria-expanded={open.value ? 'true' : 'false'}
          aria-controls={id}
          aria-activedescendant={
            open.value && hits.value.length ? `${id}-${active.value}` : undefined
          }
          aria-busy={busy.value ? 'true' : undefined}
          aria-describedby={p.describedby}
          aria-invalid={p.invalid ? 'true' : undefined}
          autocomplete={p.rest.autocomplete ?? 'off'}
          value={text()}
          onInput={(e) => {
            const v = e.currentTarget.value
            onText?.(v)
            run(v)
          }}
          onKeyDown={onKey}
        />
      )}
      end={comboEnd({
        id,
        label: () => rest.label,
        rows,
        active,
        pick,
        setPop,
      })}
    />
  )
}
