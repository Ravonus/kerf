import { LeftIcon, RightIcon } from '@weft-js/warp-icons'
import { addMonths, dayState, fmt, gridKey, isoWeek, isWeekend, isUnavailable, messages, monthEnd, monthStart, monthWeeks, ymd, weekStart, weekdays, type CalendarContext, type CalendarMode, type CalendarValue, type ChangeReason, type DateRange, type IsoDate } from '@weft-js/warp-core'
import { derived, flush, state, untrack, watch } from '@weft-js/core'
import { Button } from './Button'
import { bindable, uid, usePickerEnv, type Bindable } from './Picker'
import './styles'
import '@weft-js/warp-core/styles/rich/calendar-grid.css'

export interface GridProps {
  mode: CalendarMode
  months?: number
  value: () => CalendarValue
  compare?: () => DateRange | null | undefined
  locale: string
  today: string
  min?: string | undefined
  max?: string | undefined
  isDateUnavailable?: ((d: IsoDate) => boolean) | undefined
  firstDayOfWeek?: number | undefined
  weekNumbers?: boolean | undefined
  /** Marks the focused day `data-initial`, so a panel opens onto it. */
  autofocus?: boolean
  onPick: (iso: IsoDate, reason: ChangeReason) => void
  onHover?: (iso: IsoDate | null) => void
  onUnavailable?: (iso: IsoDate) => void
  /** A cursor from outside (a preset moved the months). */
  goTo?: () => string | null | undefined
  children?: unknown
}

const startOf = (v: CalendarValue, today: string, mode: CalendarMode) => (mode === 'range' ? (v as DateRange)?.start : mode === 'multiple' ? [...((v as IsoDate[]) ?? [])].sort()[0] : mode === 'week' ? null : (v as string | null)) ?? today

/**
 * The APG date grid (04 §1.4): one table per month, one tab stop on the cursor's day. Blank cells stand for days of
 * other months. A day is never named "14" alone: every button carries the full date and its state.
 */
export function CalendarGrid(p: GridProps) {
  const firstDay = derived(() => p.firstDayOfWeek ?? weekStart(p.locale))
  const count = () => p.months ?? 1
  const cursor = state(untrack(() => startOf(p.value(), p.today, p.mode)))
  const view = state(monthStart(untrack(() => cursor.value)))
  const hover = state<string | null>(null)
  const anim = state<'next' | 'prev' | undefined>(undefined)
  let box: HTMLDivElement | undefined
  const shown = derived(() => Array.from({ length: count() }, (_, n) => ({ month: addMonths(view.value, n) })))
  const heads = derived(() => weekdays(firstDay.value, p.locale))
  const t = derived(() => messages(p.locale))
  const context = (): CalendarContext => ({ mode: p.mode, value: p.value(), compare: p.compare?.(), today: p.today, locale: p.locale, hover: hover.value, min: p.min, max: p.max, isDateUnavailable: p.isDateUnavailable })
  const lastDay = () => monthEnd(addMonths(view.value, count() - 1))
  const moveTo = (iso: string) => {
    if (iso < view.value) { anim.value = 'prev'; view.value = monthStart(iso) }
    else if (iso > lastDay()) { anim.value = 'next'; view.value = monthStart(addMonths(iso, -(count() - 1))) }
    cursor.value = iso
  }
  const focusCursor = () => { flush(); box?.querySelector<HTMLElement>('[data-part="day"][tabindex="0"]')?.focus() }
  const pick = (iso: string, reason: ChangeReason) => {
    if (isUnavailable(iso, context())) return p.onUnavailable?.(iso as IsoDate)
    cursor.value = iso
    hover.value = null
    p.onPick(iso as IsoDate, reason)
  }
  const onKey = (e: KeyboardEvent) => {
    if (!(e.target as Element).closest?.('[data-part="day"]')) return
    const to = gridKey(e.key, e.shiftKey, cursor.value, firstDay.value, getComputedStyle(box!).direction === 'rtl')
    if (!to) return
    e.preventDefault()
    if (to === 'pick') return pick(cursor.value, 'keyboard')
    if (p.mode === 'range') hover.value = to
    moveTo(to)
    focusCursor()
  }
  const onClick = (e: MouseEvent) => {
    const b = (e.target as Element).closest?.<HTMLElement>('[data-part="day"]')
    if (b) pick(b.dataset.date!, 'pointer')
  }
  const onOver = (e: PointerEvent) => {
    const b = (e.target as Element).closest?.<HTMLElement>('[data-part="day"]')
    if (p.mode !== 'range' || !b || hover.value === b.dataset.date) return
    hover.value = b.dataset.date!
    p.onHover?.(hover.value as IsoDate)
  }
  const onLeave = () => { if (p.mode === 'range') { hover.value = null; p.onHover?.(null) } }
  const page = (d: number) => { anim.value = d > 0 ? 'next' : 'prev'; view.value = addMonths(view.value, d); cursor.value = addMonths(cursor.value, d) }
  watch(() => p.goTo?.(), iso => { if (iso) moveTo(iso) })
  return (
    <div ref={n => (box = n)} data-scope="calendar" data-part="root">
      <Button emphasis="ghost" size="sm" icon={LeftIcon} label={t.value.prev} data-part="nav" data-dir="prev" data-icon="" onClick={() => page(-1)} />
      <Button emphasis="ghost" size="sm" icon={RightIcon} label={t.value.next} data-part="nav" data-dir="next" data-icon="" onClick={() => page(1)} />
      <div data-part="months" data-anim={anim.value} onKeyDown={onKey} onClick={onClick} onPointerOver={onOver} onPointerLeave={onLeave}>
        {shown.value.map(m => <Month key={m.month} month={m.month} heads={heads.value} first={firstDay.value} weekNumbers={p.weekNumbers} locale={p.locale} wholeWeek={p.mode === 'week'} ctx={context} cursor={cursor.value} initial={p.autofocus} />)}
      </div>
      {p.children}
    </div>
  )
}

function Month({ month, heads, first, weekNumbers, locale, wholeWeek, ctx, cursor, initial }: { month: string; heads: readonly (readonly [string, string, number])[]; first: number; weekNumbers?: boolean | undefined; locale: string; wholeWeek: boolean; ctx: () => CalendarContext; cursor: string; initial?: boolean | undefined }) {
  const cap = uid('cap')
  const weeks = derived(() => monthWeeks(month, first).map(days => ({ days: days.map((iso, c) => ({ iso, k: iso ?? `b${c}`, weekday: (first + c) % 7 })), k: days.find(Boolean)!, week: isoWeek(days.find(Boolean)!).week })))
  return (
    <div data-part="month">
      <div data-part="caption" id={cap} aria-live="polite">{fmt(month, { month: 'long', year: 'numeric' }, locale)}</div>
      <table role="grid" aria-labelledby={cap}>
        <thead>
          <tr>
            {weekNumbers && <th scope="col" abbr={messages(locale).week}><span class="sr">{messages(locale).week}</span></th>}
            {heads.map(h => <th key={h[0]} scope="col" abbr={h[0]}>{h[1]}</th>)}
          </tr>
        </thead>
        <tbody>
          {weeks.value.map(w => (
            <tr key={w.k}>
              {weekNumbers && <th scope="row" data-part="week">{w.week}</th>}
              {w.days.map(d => (d.iso ? <Day key={d.k} iso={d.iso} weekend={isWeekend(d.weekday, locale)} locale={locale} wholeWeek={wholeWeek} ctx={ctx} cursor={cursor} initial={initial} /> : <td key={d.k} role="gridcell"></td>))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Day({ iso, weekend, locale, ctx, cursor, initial }: { iso: IsoDate; weekend: boolean; locale: string; wholeWeek: boolean; ctx: () => CalendarContext; cursor: string; initial?: boolean | undefined }) {
  const s = derived(() => dayState(iso, ctx()))
  const n = derived(() => new Intl.NumberFormat(locale).format(ymd(iso)[2]))
  return (
    <td role="gridcell" aria-selected={s.value.cellSelected ? 'true' : 'false'} data-range={s.value.range} data-preview={s.value.preview ? '' : undefined} data-compare={s.value.compare ? '' : undefined}>
      <button type="button" data-part="day" data-date={iso} tabindex={iso === cursor ? '0' : '-1'} data-initial={initial && iso === cursor ? '' : undefined} data-weekend={weekend ? '' : undefined} data-selected={s.value.selected ? '' : undefined} data-booked={s.value.unavailable && s.value.booked ? '' : undefined} aria-current={s.value.today ? 'date' : undefined} aria-disabled={s.value.unavailable ? 'true' : undefined} aria-label={s.value.name}>{n.value}</button>
    </td>
  )
}

export type InlineCalendarValue = IsoDate | IsoDate[] | DateRange | null

/**
 * InlineCalendar (04 §2): the same grid, standalone, for availability and booking. 1–3 months; `single`, `multiple`
 * (toggles days, announces the count) or `range`. No field shell: `aria-label` names it.
 */
export function InlineCalendar({ selection = 'single', months = 1, value, defaultValue, onValueChange, min, max, isDateUnavailable, firstDayOfWeek, weekNumbers, locale, today, ...rest }: Bindable<InlineCalendarValue> & { selection?: 'single' | 'multiple' | 'range'; months?: 1 | 2 | 3; min?: string | undefined; max?: string | undefined; isDateUnavailable?: ((d: IsoDate) => boolean) | undefined; firstDayOfWeek?: number | undefined; weekNumbers?: boolean | undefined; locale?: string | undefined; today?: string | undefined; 'aria-label': string }) {
  const env = usePickerEnv(() => locale, () => today)
  const empty = (): InlineCalendarValue => (selection === 'multiple' ? [] : selection === 'range' ? { start: null, end: null } : null)
  const v = bindable<InlineCalendarValue>(() => value, () => defaultValue, untrack(empty), () => onValueChange)
  const said = state('')
  const onPick = (iso: IsoDate, reason: ChangeReason) => {
    if (selection === 'single') return v.set(iso, reason)
    if (selection === 'multiple') {
      const now = (v.value as IsoDate[]) ?? []
      const next = now.includes(iso) ? now.filter(d => d !== iso) : [...now, iso]
      v.set(next, reason)
      said.value = next.length === 1 ? '1 day selected' : `${next.length} days selected`
      return
    }
    const r = v.value as DateRange
    v.set(!r?.start || r.end ? { start: iso, end: null } : iso < r.start ? { start: iso, end: r.start } : { start: r.start, end: iso }, reason)
  }
  return (
    <div role="group" {...rest}>
      <CalendarGrid mode={selection} months={months} value={() => v.value} locale={env.locale.value} today={env.today.value} min={min} max={max} isDateUnavailable={isDateUnavailable} firstDayOfWeek={firstDayOfWeek} weekNumbers={weekNumbers} onPick={onPick} />
      <span class="sr" role="status">{said.value}</span>
    </div>
  )
}
