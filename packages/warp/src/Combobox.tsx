import { comboPopup, uid } from '@weft/ui-core'
import { derived, flush, onCleanup, state, untrack } from 'weft'
import { Field, type FieldProps } from './Field'
import { Icon, type IconRef } from './Icon'
import { use } from './use'
import '@weft/ui-core/styles/rich/listbox.css'
import '@weft/ui-core/styles/rich/popover.css'

export type ComboRow = { main: string; sub?: string; meta?: string; icon?: IconRef }

export type ComboFieldProps<T> = FieldProps & {
  /** The app's search. Superseded calls are aborted. */
  find: (q: string, signal: AbortSignal) => Promise<T[]>
  row: (hit: T) => ComboRow
  onPick: (hit: T) => void
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

/**
 * A text field with a list popup (04 §3, APG Combobox, list autocomplete with automatic selection): focus stays in the
 * input. Typing `minChars` opens the list with the first result active, ↓/↑ wrap, Enter picks, Esc closes and keeps the
 * text, a second Esc clears it, ↓ on a closed combobox searches again. Requests are debounced 120ms and aborted when
 * superseded. Shared by PlaceLookupInput and AddressField's line 1.
 */
export function ComboField<T>({ find, row, onPick, onText, onFail, text, minChars = 2, timeout, status, hint, ...rest }: ComboFieldProps<T>) {
  const id = uid('combo')
  const hits = state<T[]>([])
  const active = state(0)
  const open = state(false)
  const busy = state(false)
  const rows = derived(() => hits.value.map((hit, at) => ({ at, r: untrack(() => row)(hit) })))
  let input: HTMLInputElement | undefined
  let pop: HTMLDivElement | undefined
  let timer: ReturnType<typeof setTimeout> | undefined
  let stop: AbortController | undefined
  const cancel = () => { clearTimeout(timer); stop?.abort(); stop = undefined; busy.value = false }
  onCleanup(cancel)
  use(comboPopup, () => pop, () => ({ open: open.value, anchor: (input?.closest('[data-part="control"]') ?? input) as HTMLElement, onClose: () => (open.value = false) }))
  const run = (q: string) => {
    cancel()
    if (q.trim().length < minChars) { open.value = false; hits.value = []; return }
    timer = setTimeout(async () => {
      const me = (stop = new AbortController())
      busy.value = true
      const late = timeout ? setTimeout(() => me.abort(), timeout) : undefined
      try {
        const r = await find(q.trim(), me.signal)
        if (me !== stop) return
        hits.value = r
        active.value = 0
        open.value = r.length > 0
      } catch {
        if (me === stop || me.signal.aborted) { open.value = false; onFail?.() }
      } finally {
        clearTimeout(late)
        if (me === stop) busy.value = false
      }
    }, 120)
  }
  const pick = (at: number) => { open.value = false; onPick(hits.value[at]) }
  const onKey = (e: KeyboardEvent) => {
    const el = e.currentTarget as HTMLInputElement
    if (e.key === 'Escape') {
      e.preventDefault()
      if (open.value) open.value = false
      else if (el.value) { cancel(); onText?.('') }
    } else if (e.key === 'ArrowDown' && !open.value) { e.preventDefault(); run(el.value) }
    else if (open.value && hits.value.length) {
      const d = ({ ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key]
      if (d) {
        e.preventDefault()
        active.value = (active.value + d + hits.value.length) % hits.value.length
        flush()
        pop?.querySelector('[data-active]')?.scrollIntoView?.({ block: 'nearest' })
      } else if (e.key === 'Enter') { e.preventDefault(); pick(active.value) }
    }
  }
  const shownHint = derived(() => (busy.value ? 'Searching…' : status?.() ?? hint))
  return (
    <Field
      {...rest}
      hint={shownHint.value}
      filled={text().length > 0}
      hold={open.value}
      control={({ id: field, describedby, invalid, rest: live }) => (
        <input ref={(n: any) => (input = n)} {...live} data-part="input" id={field} placeholder=" " role="combobox" aria-autocomplete="list" aria-expanded={open.value ? 'true' : 'false'} aria-controls={id} aria-activedescendant={open.value && hits.value.length ? `${id}-${active.value}` : undefined} aria-busy={busy.value ? 'true' : undefined} aria-describedby={describedby} aria-invalid={invalid ? 'true' : undefined} autocomplete={live.autocomplete ?? 'off'} value={text()} onInput={e => { const v = (e.currentTarget as HTMLInputElement).value; onText?.(v); run(v) }} onKeyDown={onKey} />
      )}
      end={
        <div ref={(n: any) => (pop = n)} data-scope="popover" data-kind="combo" data-sweep="" data-phase="idle" popover="manual" role="presentation" onPointerDown={e => e.preventDefault()}>
          <span data-part="sweep" aria-hidden="true"></span>
          <ul data-part="listbox" role="listbox" id={id} aria-label={rest.label}>
            {rows.value.map(({ at, r }) => (
              <li key={`${at}:${r.main}`} role="option" id={`${id}-${at}`} aria-selected={at === active.value ? 'true' : 'false'} data-active={at === active.value ? '' : undefined} onClick={() => pick(at)}>
                {r.icon && <Icon name={r.icon} />}
                <span>{r.main}{r.sub && <small> {r.sub}</small>}</span>
                {r.meta && <span data-part="opt-meta">{r.meta}</span>}
              </li>
            ))}
          </ul>
        </div>
      }
    />
  )
}
