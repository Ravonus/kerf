import { announce, clock, fmt, longDuration, minutes, uid, type IsoDate, type IsoTime } from '@weft-js/warp-core'
import { derived, flush, state, untrack, type State } from '@weft-js/core'
import { Button } from '../Button'
import { InlineCalendar } from '../Calendar'
import { Alert } from '../Alert'
import { usePickerEnv } from '../Picker'
import { Skeleton } from '../Skeleton'
import { TimeField } from '../TimeField'
import { SweepParts, confirmSweep } from './bits'
import '@weft-js/warp-core/styles/app/booking.css'
import '@weft-js/warp-core/styles/rich/calendar-grid.css'

/** A start in minutes; `disabled` shows it taken rather than hiding it. */
export type BookingSlot = { s: number; disabled?: boolean | undefined }
/** The slot being booked, in minutes from midnight; manual when typed rather than picked. */
export type BookingDetails = { date: string; s: number; e: number; manual: boolean }
/** Props for BookingCalendar. */
export type BookingCalendarProps = {
  /** The times for a day: a list, or read from the date. */
  slots: BookingSlot[] | ((date: string) => BookingSlot[])
  /** The picked day: a state it writes, or a plain value with `onDateChange`. */
  date?: State<IsoDate | null> | IsoDate
  /** The day picked at the start, when the calendar keeps its own state. */
  defaultDate?: IsoDate
  /** Called with the day picked. Load that day's slots here. */
  onDateChange?: (d: IsoDate) => void
  duration?: number
  min?: string
  max?: string
  isDateUnavailable?: (d: IsoDate) => boolean
  loading?: boolean
  error?: any
  /** Pins today's date, for server rendering and tests. The browser's clock otherwise. */
  today?: string
  locale?: string
  /** `h12` for AM and PM, `h23` for a 24-hour clock. The locale's otherwise. */
  hourCycle?: string
  /** Rejecting keeps the confirm step and says why. */
  onBook: (b: BookingDetails) => void | Promise<unknown>
}

/**
 * BookingCalendar (07 §2.2): InlineCalendar plus slot buttons (`aria-pressed`), a confirm step with a manual time as the
 * fallback field path, and the arrival sweep on the confirmation card.
 */
export function BookingCalendar(p: BookingCalendarProps) {
  const id = uid('book')
  const env = usePickerEnv(() => p.locale, () => p.today)
  const own = state<IsoDate | null>(untrack(() => (typeof p.date === 'string' ? p.date : p.defaultDate) ?? null))
  const date = derived(() => (p.date && typeof p.date === 'object' ? p.date.value : typeof p.date === 'string' ? p.date : own.value))
  const pick = state<number | null>(null)
  const manual = state(false)
  const typed = state<IsoTime | null>(null)
  const stage = state<'pick' | 'confirm' | 'done'>('pick')
  const busy = state(false)
  const failed = state<string | null>(null)
  const len = derived(() => p.duration ?? 30)
  const list = derived(() => { const d = date.value; if (!d) return []; return typeof p.slots === 'function' ? p.slots(d) : p.slots })
  const chosen = derived(() => (manual.value ? (typed.value ? minutes(typed.value) : null) : pick.value))
  const when = derived(() => { const d = date.value, s = chosen.value; return d && s !== null ? `${fmt(d, { weekday: 'short', month: 'short', day: 'numeric' }, env.locale.value)} · ${clock(s, env.locale.value, p.hourCycle)}–${clock(s + len.value, env.locale.value, p.hourCycle)}` : '' })
  let root: HTMLDivElement | undefined
  const setDate = (d: IsoDate) => {
    if (p.date && typeof p.date === 'object') p.date.value = d
    else own.value = d
    p.onDateChange?.(d)
    pick.value = null
    stage.value = 'pick'
  }
  const onSlots = (e: KeyboardEvent) => {
    const d = ({ ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 } as Record<string, number>)[e.key]
    const on = [...(e.currentTarget as HTMLElement).querySelectorAll<HTMLButtonElement>('button:not(:disabled)')]
    const i = on.indexOf(e.target as HTMLButtonElement)
    if (d && i >= 0) { e.preventDefault(); on[(i + d + on.length) % on.length]!.focus() }
  }
  const toConfirm = () => {
    stage.value = 'confirm'
    flush()
    root?.querySelector<HTMLElement>('[data-confirm-step] button:last-child')?.focus()
  }
  const book = async () => {
    const d = date.value, s = chosen.value
    if (!d || s === null || busy.value) return
    busy.value = true
    failed.value = null
    try {
      await p.onBook({ date: d, s, e: s + len.value, manual: manual.value })
      stage.value = 'done'
      flush()
      if (root) { confirmSweep(root.querySelector('[data-part="slot"][aria-pressed="true"]')); announce(root.ownerDocument, `Booked ${when.value}`) }
    } catch (err) {
      failed.value = (err as Error | undefined)?.message ?? 'That time was just taken.'
      if (root) announce(root.ownerDocument, `Couldn't book: ${failed.value}`, true)
    } finally { busy.value = false }
  }
  const empty = derived(() => !list.value.some(s => !s.disabled))
  return (
    <div ref={n => (root = n)} data-scope="booking" data-part="root">
      <InlineCalendar aria-label="Choose a date" value={date.value} onValueChange={d => setDate(d as IsoDate)} today={env.today.value} locale={env.locale.value} min={p.min} max={p.max} isDateUnavailable={p.isDateUnavailable} />
      {stage.value === 'done'
        ? <div data-arrive="" class="row" role="status"><div><b>Booked · {when.value}</b><p class="muted">{longDuration(len.value)}. We've sent the details.</p></div><Button emphasis="ghost" tone="neutral" size="sm" onClick={() => { stage.value = 'pick'; pick.value = null }}>Book another</Button></div>
        : <>
            {!date.value && <p class="muted">Pick a date to see the times.</p>}
            {date.value && p.loading && <div data-part="slots" aria-busy="true"><Skeleton /><Skeleton /><Skeleton /></div>}
            {date.value && !p.loading && p.error && <Alert tone="critical" title="Couldn't load the times" live>{p.error}</Alert>}
            {date.value && !p.loading && !p.error && !manual.value && (
              <>
                <div data-part="slots" role="group" aria-label={`Times on ${fmt(date.value, { dateStyle: 'full' }, env.locale.value)}`} onKeyDown={onSlots}>
                  {list.value.map(x => <button key={x.s} type="button" data-part="slot" data-sweep="" aria-pressed={x.s === pick.value ? 'true' : 'false'} disabled={x.disabled} onClick={() => { pick.value = x.s; stage.value = 'pick' }}><SweepParts />{clock(x.s, env.locale.value, p.hourCycle)}</button>)}
                </div>
                {empty.value && <p class="muted">No times left on this day.</p>}
              </>
            )}
            {date.value && manual.value && <TimeField id={`${id}-t`} label="Time" value={typed} locale={env.locale.value} hourCycle="h23" hint="Type any time." />}
            {date.value && !p.error && (
              <div class="row">
                <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => { manual.value = !manual.value; stage.value = 'pick' }}>{manual.value ? 'Show suggested times' : 'Enter a time'}</Button>
                <span style="flex:1"></span>
                {stage.value === 'pick' && <Button disabled={chosen.value === null} onClick={toConfirm}>Continue</Button>}
              </div>
            )}
            {stage.value === 'confirm' && (
              <div class="row" data-confirm-step="">
                <span><b>{when.value}</b> <span class="muted">{longDuration(len.value)}</span></span>
                <Button emphasis="outline" tone="neutral" size="sm" onClick={() => (stage.value = 'pick')}>Back</Button>
                <Button size="sm" loading={busy.value} onClick={book}>Confirm</Button>
              </div>
            )}
            {failed.value && <Alert tone="critical" title="Couldn't book" live>{failed.value}</Alert>}
          </>}
    </div>
  )
}
