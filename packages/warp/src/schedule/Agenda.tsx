import { PlusIcon } from '@weft-js/warp-icons'
import { addDays, agendaItems, announce, at, clock, dayDots, eventsOn, fmt, longDuration, longPress, slide, swipePages, uid, weekDates, weekStart, ymd, type AgendaItem, type CalEvent, type IsoDate, type Slot } from '@weft-js/warp-core'
import { derived, flush, state, untrack, type State } from '@weft-js/core'
import { Button } from '../Button'
import { bindable, usePickerEnv } from '../Picker'
import { use } from '@weft-js/warp-core/weft'
import { RepeatGlyph, tint, useNow } from './bits'
import { EventEditor, type CalendarSource } from './EventEditor'
import { MoveSheet } from './MoveSheet'
import '@weft-js/warp-core/styles/app/agenda.css'
import '@weft-js/warp-core/styles/components/fab.css'

const summary = (e: CalEvent) => [e.location, e.video ? 'Video call' : '', e.attendees?.length ? `${e.attendees.length} people` : ''].filter(Boolean).join(' · ')

function Row({ item, hourCycle, locale }: { item: AgendaItem; hourCycle?: string | undefined; locale: string }) {
  const time = (m: number) => clock(m, locale, hourCycle)
  return <>{item.kind === 'now'
    ? <div data-part="now" role="listitem" aria-label={`Now, ${time(item.at)}`} aria-current="time"><span aria-hidden="true">{time(item.at)}</span><i></i></div>
    : item.kind === 'free'
      ? <div data-part="free" role="listitem"><span></span><span>{longDuration(item.minutes)} free</span></div>
      : item.kind === 'allday'
        ? <div data-part="row" data-allday="" data-cal={item.event.cal ?? 1} style={tint(item.event.cal)} role="listitem" data-id={item.event.id} tabindex="0"><time>All day</time><i></i><div><b>{item.event.title}</b></div></div>
        : <div data-part="row" data-cal={item.event.cal ?? 1} style={tint(item.event.cal)} data-id={item.event.id} role="listitem" tabindex="0" aria-label={`${item.event.title}, ${time(item.s)} to ${time(item.e)}`}>
            <time>{time(item.s)}<small>{time(item.e)}</small></time>
            <i></i>
            <div><b>{item.event.recurrence && <RepeatGlyph />}{item.event.recurrence ? ' ' : ''}{item.event.title}</b><span>{summary(item.event) || longDuration(item.e - item.s)}</span></div>
          </div>}</>
}

/** One day's list of rows; the Agenda pages and the Calendar's Agenda view both draw it. */
export function AgendaDay({ events, day, now, locale, hourCycle, label }: { events: CalEvent[]; day: string; now?: string | null | undefined; locale: string; hourCycle?: string | undefined; label: string }) {
  const items = derived(() => agendaItems(events, day, now))
  return <>{items.value.length
    ? <div role="list" aria-label={label}>{items.value.map(i => <Row key={i.key} item={i} locale={locale} hourCycle={hourCycle} />)}</div>
    : <div data-scope="empty-state"><p data-part="description">Nothing scheduled. Enjoy it.</p></div>}</>
}

/** Props for Agenda. */
export type AgendaProps = {
  events: CalEvent[]
  /** The day it opens on: a state it writes as you page, or a plain value. */
  date?: State<string> | string | undefined
  defaultDate?: string | undefined
  /** Called with the new day when you page or jump to today. */
  onDateChange?: ((d: string) => void) | undefined
  title?: unknown | undefined
  /** The calendars the events belong to, for their colours and names. */
  calendars?: CalendarSource[] | undefined
  /** The IANA zone times are shown in, such as `Europe/Berlin`. The browser's otherwise. */
  timeZone?: string | undefined
  /** Pins today's date, for server rendering and tests. The browser's clock otherwise. */
  today?: string | undefined
  /** Pins the current time, for server rendering and tests. The browser's clock otherwise. */
  now?: string | undefined
  locale?: string | undefined
  /** `h12` for AM and PM, `h23` for a 24-hour clock. The locale's otherwise. */
  hourCycle?: string | undefined
  firstDayOfWeek?: number | undefined
  /** Long press: open your own sheet. Without it the built-in MoveSheet opens and calls `onMove`. */
  onLongPress?: ((e: CalEvent) => void) | undefined
  onMove?: (e: CalEvent, to: { start: string; end: string; resource?: string | undefined }) => void
  onOpen?: ((e: CalEvent) => void) | undefined
  /** The FAB opens the editor; Save calls this. */
  onCreate?: ((e: CalEvent) => void) | undefined
}

/**
 * The phone agenda (07 §2.3, `#cal-phone`): a week strip of APG tabs with dots per source, three day pages that swipe, a
 * now marker, "1 h free" gaps and the FAB. A long press (or Shift+F10) opens the MoveSheet.
 */
export function Agenda(p: AgendaProps) {
  const id = uid('agenda')
  const env = usePickerEnv(() => p.locale, () => p.today)
  const date = bindable<string>(() => p.date, () => p.defaultDate, untrack(() => env.today.value), () => p.onDateChange)
  const now = useNow(() => p.now, () => p.timeZone)
  const first = derived(() => p.firstDayOfWeek ?? weekStart(env.locale.value))
  const week = derived(() => weekDates(date.value, first.value))
  const pages = derived(() => [-1, 0, 1].map(d => ({ day: addDays(date.value, d), at: d })))
  const month = derived(() => fmt(date.value, { month: 'long' }, env.locale.value))
  const moving = state<CalEvent | null>(null)
  const sheet = state(false)
  const lifted = state<string | null>(null)
  const draft = state<CalEvent | null>(null)
  const editing = state(false)
  let root: HTMLDivElement | undefined
  let view: HTMLDivElement | undefined
  let track: HTMLDivElement | undefined
  const say = (t: string) => root && announce(root.ownerDocument, t)
  const settle = (d: string, focus?: boolean  ) => {
    date.set(d)
    if (track) { track.style.removeProperty('--_dx') }
    say(`${fmt(d, { weekday: 'long' }, env.locale.value)}, ${eventsOn(p.events, d).length} events`)
    if (focus) { flush(); root?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]')?.focus() }
  }
  const go = (d: string, focus?: boolean  ) => {
    const off = untrack(() => date.value)
    if (d === off) { track?.style.setProperty('--_dx', '0px'); return }
    const near = addDays(off, 1) === d || addDays(off, -1) === d
    if (!track || !near) return settle(d, focus)
    slide(track, `${d > off ? -100 : 100}%`, () => settle(d, focus))
  }
  const byId = (i: string | undefined) => p.events.find(e => e.id === i)
  const open = (e: CalEvent) => {
    if (p.onLongPress) return p.onLongPress(e)
    if (!p.onMove) return
    moving.value = e
    lifted.value = e.id
    sheet.value = true
  }
  use(swipePages, () => view, () => ({ track: () => track, onStep: (d: 1 | -1) => go(addDays(date.value, d)) }))
  use(longPress, () => view, () => ({ selector: '[data-part="row"][data-id]', onPress: (r: HTMLElement) => { const e = byId(r.dataset.id); if (e) open(e) } }))
  const onKey = (e: KeyboardEvent) => {
    const r = (e.target as Element).closest?.<HTMLElement>('[data-part="row"][data-id]')
    if (!r) return
    const hit = byId(r.dataset.id)
    if (!hit) return
    if (e.key === 'F10' && e.shiftKey) { e.preventDefault(); open(hit) }
    else if (e.key === 'Enter') { e.preventDefault(); p.onOpen ? p.onOpen(hit) : open(hit) }
  }
  const onClick = (e: MouseEvent) => { const hit = byId((e.target as Element).closest?.<HTMLElement>('[data-part="row"][data-id]')?.dataset.id); if (hit) p.onOpen?.(hit) }
  const onTabs = (e: KeyboardEvent) => {
    const to = ({ ArrowRight: 1, ArrowLeft: -1 } as Record<string, number>)[e.key]
    const days = week.value
    const i = days.indexOf(date.value as IsoDate)
    if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); return settle(days[e.key === 'Home' ? 0 : 6]!, true) }
    if (!to) return
    e.preventDefault()
    const rtl = getComputedStyle(e.currentTarget as Element).direction === 'rtl'
    settle(days[(i + (rtl ? -to : to) + 7) % 7]!, true)
  }
  const create = () => {
    const d = date.value
    draft.value = { id: uid('new'), title: '', start: `${d}T13:00`, end: `${d}T14:00`, cal: 1 }
    editing.value = true
  }
  const moved = (e: CalEvent, to: Slot) => {
    p.onMove?.(e, { start: at(to.date, to.s), end: at(to.date, to.e), resource: to.resource })
    go(to.date)
    say(`Moved ${e.title} to ${fmt(to.date, { weekday: 'long' }, env.locale.value)} ${clock(to.s, env.locale.value, p.hourCycle)}`)
  }
  return (
    <div ref={n => (root = n)} data-scope="agenda" data-part="root">
      <div data-part="app-bar">
        <h3 data-part="app-title">{p.title ?? month.value}</h3>
        <span data-part="spacer"></span>
        <Button emphasis="outline" tone="neutral" size="sm" onClick={() => go(env.today.value)}>Today</Button>
      </div>
      <div data-part="strip" role="tablist" aria-label={`Week of ${fmt(week.value[0]!, { month: 'short', day: 'numeric' }, env.locale.value)}`} onKeyDown={onTabs}>
        {week.value.map(d => (
          <button key={d} type="button" role="tab" id={`${id}-${d}`} aria-controls={`${id}-panel`} aria-selected={d === date.value ? 'true' : 'false'} tabindex={d === date.value ? '0' : '-1'} data-today={d === env.today.value ? '' : undefined} onClick={() => go(d)}>
            <strong class="sr">{fmt(d, { weekday: 'long', month: 'short', day: 'numeric' }, env.locale.value)}</strong>
            <span aria-hidden="true">{fmt(d, { weekday: 'narrow' }, env.locale.value)}</span>
            <b aria-hidden="true">{ymd(d)[2]}</b>
            <i>{dayDots(p.events, d).map(c => <em key={c} data-cal={c}></em>)}</i>
          </button>
        ))}
      </div>
      <div ref={n => (view = n)} data-part="viewport" id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${date.value}`} onKeyDown={onKey} onClick={onClick}>
        <div ref={n => (track = n)} data-part="track">
          {pages.value.map(g => (
            <div key={g.day} data-part="page" aria-hidden={g.at ? 'true' : undefined} inert={g.at ? true : undefined}>
              <div data-part="day-title"><h4>{fmt(g.day, { weekday: 'long' }, env.locale.value)}</h4><span class="muted">{fmt(g.day, { month: 'short', day: 'numeric' }, env.locale.value)}</span></div>
              <AgendaDay events={p.events} day={g.day} now={now.value} locale={env.locale.value} hourCycle={p.hourCycle} label={fmt(g.day, { weekday: 'long' }, env.locale.value)} />
            </div>
          ))}
        </div>
      </div>
      {p.onCreate && <button data-scope="fab" type="button" aria-label="New event" onClick={create}><PlusIcon /></button>}
      <MoveSheet open={sheet} event={moving.value} events={p.events} firstDayOfWeek={first.value} locale={env.locale.value} hourCycle={p.hourCycle} onMove={moved} onClose={() => (lifted.value = null)} />
      <EventEditor open={editing} event={draft.value} isNew calendars={p.calendars} timeZone={p.timeZone} locale={env.locale.value} today={env.today.value} onSave={e => p.onCreate?.(e)} />
    </div>
  )
}
