import { LeftIcon, RightIcon } from '@weft/icons'
import { addMonths, announce, clock, eventsOn, fmt, minuteOf, monthStart, monthSummary, monthWeeks, motionOff, uid, weekStart, weekdays, ymd, yearKey, yearLevel, yearMonths, yearTotal, type CalEvent, type IsoDate } from '@weft/ui-core'
import { derived, flush, state, untrack } from 'weft'
import { Button } from '../Button'
import { usePickerEnv } from '../Picker'
import './bits'
import '@weft/ui-core/styles/app/year.css'

export type YearViewProps = {
  /** `{ [isoDay]: n }`: a year's counts only (07 §2.7). */
  counts: Record<string, number>
  /** Names the section when the year alone won't do: two on a page. */
  label?: string
  /** Events for the picked day's detail: from `events`, or fetched by the app when it is picked. */
  events?: CalEvent[]
  year?: number
  today?: string
  locale?: string
  hourCycle?: string
  firstDayOfWeek?: number
  /** Inside a Calendar: return true when the day or month opened there, and the picker stays out of the way. */
  openDay?: (iso: IsoDate) => boolean | void
  openMonth?: (iso: IsoDate) => boolean | void
  /** Open straight away; off, a pick shows the detail and offers the jump. */
  direct?: boolean
  onYearChange?: (y: number) => void
}

const events = (n: number) => (n ? `${n} event${n > 1 ? 's' : ''}` : 'no events')

/**
 * The year (07 §2.7): twelve mini months with density dots, one roving stop across all twelve grids, a polite detail
 * for the picked day or month. Columns follow the container. Enter opens the day, `M` its month, `T` today.
 */
export function YearView(p: YearViewProps) {
  const id = uid('year')
  const env = usePickerEnv(() => p.locale, () => p.today)
  const first = derived(() => p.firstDayOfWeek ?? weekStart(env.locale.value))
  const heads = derived(() => weekdays(first.value, env.locale.value))
  const focus = state<string>(untrack(() => (p.year && p.year !== ymd(env.today.value)[0] ? `${p.year}-01-01` : env.today.value)))
  const year = derived(() => ymd(focus.value)[0])
  const picked = state<{ iso: string; kind: 'day' | 'month' } | null>(null)
  const swapping = state(false)
  let months: HTMLDivElement | undefined
  const say = (t: string) => months && announce(months.ownerDocument, t)
  const long = (iso: string) => fmt(iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }, env.locale.value)
  const list = derived(() => yearMonths(year.value).map(month => {
    const { total } = monthSummary(p.counts, month)
    return {
      month, total, name: fmt(month, { month: 'long' }, env.locale.value), current: month === monthStart(env.today.value),
      weeks: monthWeeks(month, first.value).map((days, r) => ({ key: `${month}-${r}`, cells: days.map((iso, c) => ({ key: iso ?? `${month}-${r}-${c}`, iso, weekend: (first.value + c) % 7 === 0 || (first.value + c) % 7 === 6 })) })),
    }
  }))
  const toCell = () => { flush(); months?.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.focus() }
  const go = (iso: string, move = true) => {
    const was = year.value
    const swap = ymd(iso)[0] !== was
    const apply = () => {
      focus.value = iso
      swapping.value = false
      if (move) toCell()
      if (swap) { say(`${ymd(iso)[0]}, ${yearTotal(p.counts, ymd(iso)[0]).toLocaleString(env.locale.value)} events`); p.onYearChange?.(ymd(iso)[0]) }
    }
    if (!swap || !months || motionOff(months)) return apply()
    swapping.value = true
    setTimeout(apply, 140)
  }
  const dayName = (iso: string) => `${long(iso)}, ${events(p.counts[iso] ?? 0)}`
  const day = (iso: string) => {
    if (p.direct !== false && p.openDay?.(iso as IsoDate)) return say(`Day view, ${long(iso)}`)
    focus.value = iso
    picked.value = { iso, kind: 'day' }
    say(dayName(iso))
  }
  const month = (iso: string) => {
    const m = monthStart(iso)
    if (p.direct !== false && p.openMonth?.(m)) return say(`Month view, ${fmt(m, { month: 'long', year: 'numeric' }, env.locale.value)}`)
    focus.value = m
    picked.value = { iso: m, kind: 'month' }
    toCell()
    const s = monthSummary(p.counts, m)
    say(`${fmt(m, { month: 'long', year: 'numeric' }, env.locale.value)}, ${s.total} events`)
  }
  const onKey = (e: KeyboardEvent) => {
    const c = (e.target as Element).closest<HTMLElement>('[data-day]')
    if (!c || e.metaKey || e.ctrlKey) return
    const to = yearKey(e.key, e.shiftKey, c.dataset.day!, first.value, getComputedStyle(c).direction === 'rtl')
    if (!to) return
    e.preventDefault()
    if (to === 'pick') day(c.dataset.day!)
    else if (to === 'month') month(c.dataset.day!)
    else if (to === 'today') go(env.today.value)
    else go(to)
  }
  const onClick = (e: MouseEvent) => {
    const t = e.target as Element
    const title = t.closest<HTMLElement>('[data-part="month-title"]')
    if (title) return month(title.dataset.month!)
    const c = t.closest<HTMLElement>('[data-day]')
    if (c) day(c.dataset.day!)
  }
  const detail = derived(() => {
    const at = picked.value
    if (!at || ymd(at.iso)[0] !== year.value) return null
    if (at.kind === 'month') {
      const s = monthSummary(p.counts, at.iso)
      return { kind: 'month' as const, iso: at.iso, head: `${fmt(at.iso, { month: 'long', year: 'numeric' }, env.locale.value)} · ${s.total} events`, busiest: s.busiest ? `Busiest day: ${long(s.busiest)}, ${s.most} events.` : undefined }
    }
    const n = p.counts[at.iso] ?? 0
    const rows = p.events ? eventsOn(p.events, at.iso) : []
    return { kind: 'day' as const, iso: at.iso, head: `${long(at.iso)} · ${n ? events(n) : 'nothing booked'}`, rows: rows.slice(0, 4), more: Math.max(0, rows.length - 4) }
  })
  return (
    <section data-scope="year" aria-label={p.label} aria-labelledby={p.label ? undefined : `${id}-t`}>
      <div data-part="toolbar">
        <Button emphasis="ghost" tone="neutral" size="sm" icon={LeftIcon} label="Previous year" onClick={() => go(addMonths(focus.value, -12), false)} />
        <h3 data-part="title" id={`${id}-t`} aria-live="polite">{year.value}</h3>
        <Button emphasis="ghost" tone="neutral" size="sm" icon={RightIcon} label="Next year" onClick={() => go(addMonths(focus.value, 12), false)} />
        <Button emphasis="outline" tone="neutral" size="sm" onClick={() => go(env.today.value)}>Today</Button>
        <span data-part="legend" aria-hidden="true"><span><i data-part="dots" data-zero=""></i>none</span><span><i data-part="dots" style="--_n:1"></i>1–2</span><span><i data-part="dots" style="--_n:2"></i>3–4</span><span><i data-part="dots" style="--_n:3"></i>5+</span></span>
      </div>
      <div ref={(n: any) => (months = n)} data-part="months" role="group" aria-labelledby={`${id}-t`} aria-describedby={`${id}-h`} data-swapping={swapping.value ? '' : undefined} onKeyDown={onKey} onClick={onClick}>
        {list.value.map(m => (
          <div key={m.month} data-part="year-month" data-current={m.current ? '' : undefined}>
            <button type="button" data-part="month-title" id={`${id}-${m.month}`} data-month={m.month} tabindex="-1">{m.name} <small>{m.total}<span class="sr"> events</span></small></button>
            <div role="grid" aria-labelledby={`${id}-${m.month}`}>
              <div role="row">{heads.value.map(h => <span key={h[0]} role="columnheader"><abbr title={h[0]}>{h[0][0]}</abbr></span>)}</div>
              {m.weeks.map(w => (
                <div key={w.key} role="row">
                  {w.cells.map(c => (c.iso
                    ? <span key={c.key} role="gridcell" data-day={c.iso} tabindex={c.iso === focus.value ? '0' : '-1'} aria-selected={picked.value?.iso === c.iso && picked.value.kind === 'day' ? 'true' : 'false'} aria-current={c.iso === env.today.value ? 'date' : undefined} data-weekend={c.weekend ? '' : undefined} aria-label={`${dayName(c.iso)}${c.iso === env.today.value ? ', today' : ''}`}><span data-part="num" aria-hidden="true">{ymd(c.iso)[2]}</span><i data-part="dots" style={`--_n:${yearLevel(p.counts[c.iso] ?? 0)}`} aria-hidden="true"></i></span>
                    : <span key={c.key} role="gridcell" data-outside="" aria-hidden="true"></span>))}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
      <span class="sr" id={`${id}-h`}>One stop for the whole year. Arrow keys move by day and week, Home and End to the week's ends, Page Up and Page Down by month, with Shift by year. Enter opens the day, M opens its month, T goes to today.</span>
      <div data-part="detail" role="status" aria-live="polite">
        {detail.value
          ? <>
              <div class="row"><b>{detail.value.head}</b>
                {detail.value.kind === 'day' && p.openDay && <Button emphasis="outline" tone="neutral" size="sm" onClick={() => p.openDay!(picked.value!.iso as IsoDate)}>Open in Day view</Button>}
                {p.openMonth && <Button emphasis="ghost" tone="neutral" size="sm" onClick={() => p.openMonth!(monthStart(picked.value!.iso))}>Open in Month view</Button>}
              </div>
              {detail.value.kind === 'month'
                ? detail.value.busiest && <span class="muted">{detail.value.busiest}</span>
                : detail.value.rows.length > 0 && <ul>
                    {detail.value.rows.map(e => <li key={e.id}><i data-cal={e.cal ?? 1}></i><span>{e.allDay ? 'All day' : clock(minuteOf(e.start), env.locale.value, p.hourCycle)}</span>{e.title}</li>)}
                    {detail.value.more > 0 && <li>+{detail.value.more} more</li>}
                  </ul>}
            </>
          : <span class="muted">Pick a day to see what's on it. More dots, busier day: one for 1–2 events, two for 3–4, three for 5 or more.</span>}
      </div>
    </section>
  )
}
