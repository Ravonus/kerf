import { GlobeIcon, LeftIcon, PlusIcon, RightIcon } from '@weft-js/warp-icons'
import { allDayBars, announce, at, edges, calendarDrag, clock, clockRange, conflicts, countByDay, dateOf, daySegments, dayState, dow, dstShift, eventKey, eventName, eventsOn, fmt, gridKey, indicator, isoWeek, isWeekend, laneKey, layoutDay, longDuration, minuteOf, monthCells, monthStart, monthWeeks, moveKey, nextIndex, overflow, popover, shownIn, slotOf, slotTimes, stepDate, toZone, uid, viewDays, weekStart, weekdays, ymd, zoneCity, type CalEvent, type CalView, type DragPreview, type IsoDate, type DaySegment, type Slot } from '@weft-js/warp-core'
import { derived, flush, onCleanup, onMount, state, untrack, watch, type State } from '@weft-js/core'
import { Button } from '../Button'
import { Modal } from '../Modal'
import { LiveStatus, type LiveState } from '../parts'
import { bindable, usePickerEnv } from '../Picker'
import { Popover } from '../Popover'
import { TimeZoneSelect } from '../RichSelect'
import { Segmented } from '../Choice'
import { Tooltip } from '../Tooltip'
import { use } from '@weft-js/warp-core/weft'
import { AgendaDay } from './Agenda'
import { RepeatGlyph, SweepParts, confirmSweep, tint, useNow, useWidth } from './bits'
import { EventEditor, type CalendarSource } from './EventEditor'
import { EventPopover } from './EventPopover'
import { MoveSheet } from './MoveSheet'
import { YearView } from './YearView'
import '@weft-js/warp-core/styles/components/tabs.css'
import '@weft-js/warp-core/styles/app/calendar.css'
import '@weft-js/warp-core/styles/layout/edges.css'

/** Which occurrences of a repeating event a change covers. */
export type RecurrenceScope = 'this' | 'following' | 'all'
export type EventChange = { start: string; end: string; resource?: string; scope?: RecurrenceScope }
/** A timeline row: a room or a person. `meta` is the quiet line under its name ("8 seats"). */
export type Resource = { id: string; name: string; meta?: string }
type Reason = 'pointer' | 'keyboard' | 'touch'

/** Props for Calendar. */
export type CalendarProps = {
  /** The events to show, in every view. Times are wall-clock ISO strings (`2026-11-04T09:30`), or dates for all-day ones. */
  events: CalEvent[]
  /** The calendars events belong to (an event's `cal`): the rail lists them with a checkbox each, and the editor offers them. */
  calendars?: CalendarSource[]
  /** The view showing: a State to share it, or a value. */
  view?: State<CalView> | CalView
  /** The view it opens on when `view` isn't given. Week without either. */
  defaultView?: CalView
  /** Hears every change of view, by tab, key or the mini month. */
  onViewChange?: (v: CalView) => void
  /** The views offered as tabs, in this order. All six without it. */
  views?: CalView[]
  /** The date the view is on (`2026-11-04`): a State to share it, or a value. */
  date?: State<string> | string
  /** The date it opens on when `date` isn't given. Today without either. */
  defaultDate?: string
  /** Hears the new date when the arrows, Today, the mini month or a drill-in move it. */
  onDateChange?: (d: string) => void
  /** The toolbar chip's zone. Without one, wall times show as they are. */
  timeZone?: State<string | null> | string
  /** Hears a zone picked from the toolbar chip, or null for wall times. */
  onTimeZoneChange?: (z: string | null) => void
  /** Secondary zones in the rail. */
  zones?: { label: string; zone: string }[]
  /** Today's date (`2026-11-02`), marked in every view. The browser's date after mount without it, so hydration writes nothing. */
  today?: string
  /** The now line's wall time; the browser's clock after mount without it. */
  now?: string
  /** The locale for day and month names, times and the first day of the week. The browser's without it. */
  locale?: string
  /** `h12` or `h23` to force a clock; the locale's without it. */
  hourCycle?: string
  /** The week's first day, 0 for Sunday to 6 for Saturday. The locale's without it. */
  firstDayOfWeek?: number
  /** Minutes a drag or resize snaps to. 15 without it. */
  snap?: number
  /**
   * Working hours as minutes from midnight, `[start, end]`: `[540, 1020]` is 09:00 to 17:00 (not `[9, 17]`). The rest of
   * the day is banded, and Week and Day open scrolled to just before `start`. 08:00 to 18:00 without it.
   */
  workingHours?: [number, number]
  /** The toolbar LiveStatus. */
  live?: LiveState | undefined
  /** Timeline rows; events point at one with `resource`. */
  resources?: Resource[]
  /** The timeline's span, in minutes from midnight like `workingHours`: `[480, 1080]` (08:00 to 18:00) without it. */
  timeline?: [number, number]
  /** Year view's counts; from `events` without it. */
  counts?: Record<string, number>
  /** Turns off dragging, resizing, creating and the keyboard move mode. Events still open their popover. */
  readOnly?: boolean
  /** A rejected promise puts the event back and announces why (07 §2.6). */
  onMove?: (e: CalEvent, to: EventChange, reason: Reason) => void | Promise<unknown>
  /** An event's edge dragged to a new time. A rejected promise puts it back and announces why. */
  onResize?: (e: CalEvent, to: EventChange, reason: Reason) => void | Promise<unknown>
  /** A new event saved from the editor, after a drag over empty time, a press on a slot or New event. */
  onCreate?: (e: CalEvent) => void
  /** An event saved from the editor; `scope` says which of a repeating event's occurrences. */
  onEdit?: (e: CalEvent, scope?: RecurrenceScope) => void
  /** An event deleted after its confirmation; `scope` says which of a repeating event's occurrences. */
  onDelete?: (e: CalEvent, scope?: RecurrenceScope) => void
  /** An event's popover opened, by press or Enter. */
  onOpen?: (e: CalEvent) => void
  /** Join pressed in the popover of an event with a `video` link. */
  onJoin?: (e: CalEvent) => void
}

const LABEL: Record<CalView, string> = { month: 'Month', week: 'Week', day: 'Day', agenda: 'Agenda', timeline: 'Timeline', year: 'Year' }
const ALL: CalView[] = ['month', 'week', 'day', 'agenda', 'timeline', 'year']
const hours = (m: number) => `calc(var(--warp-cal-hour) * ${m / 60})`

type Ctx = ReturnType<typeof useCalendar>

function useCalendar(p: CalendarProps) {
  const env = usePickerEnv(() => p.locale, () => p.today)
  const view = bindable<CalView>(() => p.view, () => p.defaultView, 'week', () => p.onViewChange)
  const date = bindable<string>(() => p.date, () => p.defaultDate, untrack(() => env.today.value), () => p.onDateChange)
  const zone = bindable<string | null>(() => p.timeZone, () => null, null, () => p.onTimeZoneChange)
  const tz = () => zone.value ?? undefined
  const now = useNow(() => p.now, tz)
  const first = derived(() => p.firstDayOfWeek ?? weekStart(env.locale.value))
  const off = state<number[]>([])
  const overlay = state<Record<string, Slot>>({})
  const waiting = new Set<string>()
  const drag = state<DragPreview | null>(null)
  const moving = state<{ id: string; origin: Slot; slot: Slot } | null>(null)
  const stop = state<string | null>(null)
  watch(() => p.events, () => {
    const keep: Record<string, Slot> = {}
    for (const id of waiting) if (overlay.value[id]) keep[id] = overlay.value[id]
    overlay.value = keep
  })
  const all = derived(() => p.events.map(e => { const v = shownIn(e, tz()), o = overlay.value[e.id]; return o ? { ...v, ...slotTimes(o), resource: o.resource ?? v.resource } : v }))
  const visible = derived(() => all.value.filter(e => !off.value.includes(e.cal ?? 1)))
  const preview = derived<DragPreview | null>(() => { const m = moving.value; return m ? { ...m.slot, mode: 'move', id: m.id, origin: m.origin } : drag.value })
  const counts = derived(() => p.counts ?? countByDay(all.value))
  const raw = (id: string) => p.events.find(e => e.id === id)
  const shown = (id: string) => all.value.find(e => e.id === id)
  let root: HTMLElement | undefined
  const say = (t: string, loud = false) => root && announce(root.ownerDocument, t, loud)
  const zoneLabel = derived(() => {
    const z = zone.value
    if (!z) return undefined
    const short = new Intl.DateTimeFormat(env.locale.value, { timeZone: z, timeZoneName: 'short' }).formatToParts(new Date(`${date.value}T12:00:00Z`)).find(x => x.type === 'timeZoneName')?.value
    return `${zoneCity(z)} · ${short}`
  })
  const nodeOf = (id: string) => root?.querySelector<HTMLElement>(`[data-id="${CSS.escape(id)}"]`)
  const focusEvent = (id: string) => { stop.value = id; flush(); nodeOf(id)?.focus({ preventScroll: false }) }
  // overlays and dialogs
  const anchor = state<HTMLElement | undefined>(undefined)
  const popped = state<string | null>(null)
  const popOpen = state(false)
  const editing = state(false)
  const draft = state<{ event: CalEvent; isNew: boolean } | null>(null)
  const sheet = state(false)
  const sheetFor = state<CalEvent | null>(null)
  const doomed = state<CalEvent | null>(null)
  const askDelete = state(false)
  const scopeOpen = state(false)
  const scope = state<RecurrenceScope>('this')
  const pendingScope = state<{ run: (s: RecurrenceScope) => void; undo?: (() => void) | undefined; verb: string } | null>(null)
  const askScope = (verb: string, run: (s: RecurrenceScope) => void, undo?: (() => void)  ) => { pendingScope.value = { run, undo, verb }; scope.value = 'this'; scopeOpen.value = true }

  const settle = (e: CalEvent, slot: Slot, verb: 'move' | 'resize', reason: Reason, chosen?: RecurrenceScope) => {
    const from = e.tz && tz() && e.tz !== tz() ? { start: toZone(at(slot.date, slot.s), tz()!, e.tz), end: toZone(at(slot.date, slot.e), tz()!, e.tz) } : slotTimes(slot)
    overlay.value = { ...overlay.value, [e.id]: slot }
    waiting.add(e.id)
    const put = () => { waiting.delete(e.id) }
    const back = (err: unknown) => {
      put()
      const { [e.id]: _, ...rest } = overlay.value
      overlay.value = rest
      say(`Couldn't ${verb} ${e.title}: ${(err as Error | undefined)?.message ?? 'try again'}`, true)
    }
    let r: PromiseLike<unknown> | undefined
    try { r = (verb === 'move' ? p.onMove : p.onResize)?.(e, { ...from, resource: slot.resource, scope: chosen }, reason) as PromiseLike<unknown> | undefined } catch (err) { back(err); return }
    if (r?.then) r.then(put, back)
    else put()
    const hit = conflicts(all.value, e, slot)
    const day = fmt(slot.date, { weekday: 'long' }, env.locale.value)
    say(`${verb === 'move' ? `Moved ${e.title} to ${day} ${clock(slot.s, env.locale.value, p.hourCycle)}` : `${e.title} now ends at ${clock(slot.e, env.locale.value, p.hourCycle)}`}${hit.length ? `. Overlaps ${hit.map(x => x.title).join(', ')}` : ''}`)
    flush()
    focusEvent(e.id)
    confirmSweep(nodeOf(e.id))
  }
  const change = (id: string, slot: Slot, verb: 'move' | 'resize', reason: Reason) => {
    const e = raw(id)
    if (!e) return
    if (!e.recurrence) return settle(e, slot, verb, reason)
    overlay.value = { ...overlay.value, [e.id]: slot }
    askScope(verb === 'move' ? 'Move' : 'Change', s => settle(e, slot, verb, reason, s), () => { const { [e.id]: _, ...rest } = overlay.value; overlay.value = rest })
  }
  const newEvent = (start: string, end: string, resource?: string  ) => {
    draft.value = { event: { id: uid('new'), title: '', start, end, cal: p.calendars?.[0]?.id ?? 1, resource }, isNew: true }
    editing.value = true
  }
  const openPopover = (id: string, el: HTMLElement) => {
    stop.value = id
    anchor.value = el
    popped.value = id
    popOpen.value = true
    const e = raw(id)
    if (e) p.onOpen?.(e)
  }
  const edit = (e: CalEvent) => { draft.value = { event: shown(e.id) ?? e, isNew: false }; editing.value = true }
  const remove = (e: CalEvent) => {
    doomed.value = e
    if (e.recurrence) return askScope('Delete', s => { p.onDelete?.(e, s); say(`Deleted ${e.title}`) })
    askDelete.value = true
  }
  const openSheet = (id: string) => { const e = shown(id); if (e && !e.locked) { sheetFor.value = e; sheet.value = true } }
  const dragOpts = () => ({
    step: p.snap ?? 15,
    readOnly: p.readOnly,
    slot: (id: string) => { const e = shown(id); return e && !e.locked ? slotOf(e) : null },
    onPreview: (v: DragPreview | null) => (drag.value = v),
    onDrop: (v: DragPreview) => {
      if (v.mode === 'create') return newEvent(at(v.date, v.s), at(v.date, v.e), v.resource)
      change(v.id!, { date: v.date, s: v.s, e: v.e, resource: v.resource }, v.mode === 'move' ? 'move' : 'resize', 'pointer')
    },
    onPress: openPopover,
    onLongPress: p.readOnly ? undefined : openSheet,
    onSlot: (d: string, m: number, r?: string) => newEvent(at(d || date.value, m), at(d || date.value, m + 30), r),
  })
  /** Keys shared by the grid and the timeline: the roving stop, Enter, M, Delete, and move mode. */
  const eventKeys = (e: KeyboardEvent, opts: { days?: string[]; resources?: string[]; next: (key: string, id: string) => string | null }) => {
    const el = (e.target as Element).closest?.<HTMLElement>('[data-id]')
    if (!el) return
    const id = el.dataset.id!
    const rtl = getComputedStyle(el).direction === 'rtl'
    const m = moving.value
    if (m && m.id === id) {
      if (e.key === 'Tab') { moving.value = null; return }
      const to = moveKey(e.key, e.shiftKey, m.slot, { step: p.snap ?? 15, days: opts.days, rtl, resources: opts.resources })
      if (to === null) return
      e.preventDefault()
      if (to === 'cancel') { moving.value = null; say('Move cancelled'); focusEvent(id); return }
      if (to === 'drop') {
        const changed = m.slot
        moving.value = null
        if (changed.date === m.origin.date && changed.s === m.origin.s && changed.e === m.origin.e && changed.resource === m.origin.resource) return focusEvent(id)
        return change(id, changed, changed.e - changed.s === m.origin.e - m.origin.s ? 'move' : 'resize', 'keyboard')
      }
      moving.value = { ...m, slot: to }
      say(`${fmt(to.date, { weekday: 'short' }, env.locale.value)} ${clockRange(to.s, to.e, env.locale.value, p.hourCycle)}`)
      focusEvent(id)
      return
    }
    const ev = shown(id)
    if (!ev) return
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openPopover(id, el); return }
    const editable = !p.readOnly && !ev.locked
    if ((e.key === 'm' || e.key === 'M') && !e.metaKey && !e.ctrlKey && editable && !ev.allDay) {
      e.preventDefault()
      const slot = slotOf(ev)
      moving.value = { id, origin: slot, slot }
      say(`Moving ${ev.title}. Arrows move by ${p.snap ?? 15} minutes or a day, Shift with arrows resizes, Enter drops, Escape cancels.`, true)
      return
    }
    if (e.shiftKey && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && editable && !ev.allDay && !opts.resources) {
      e.preventDefault()
      const to = moveKey(e.key, true, slotOf(ev), { step: p.snap ?? 15 })
      if (to && typeof to === 'object') change(id, to, 'resize', 'keyboard')
      return
    }
    if ((e.key === 'Delete' || e.key === 'Backspace') && editable && p.onDelete) { e.preventDefault(); remove(raw(id)!); return }
    const to = opts.next(e.key, id)
    if (to) { e.preventDefault(); focusEvent(to) }
  }
  return {
    env, view, date, zone, tz, now, first, off, drag, moving, stop, all, visible, preview, counts, raw, shown, say, zoneLabel, nodeOf, focusEvent,
    anchor, popped, popOpen, editing, draft, sheet, sheetFor, doomed, askDelete, scopeOpen, scope, pendingScope,
    p, dragOpts, eventKeys, change, settle, newEvent, openPopover, edit, remove, bindRoot: (n: HTMLElement) => (root = n),
    time: (m: number) => clock(m, env.locale.value, p.hourCycle), span: (a: number, b: number) => clockRange(a, b, env.locale.value, p.hourCycle),
    name: (e: CalEvent) => eventName(e, env.locale.value, p.hourCycle),
  }
}

/** The event block (07 §2.1): a button with `--_top`, `--_h` and its lane. */
function EventBlock({ seg, lane, c, stop }: { seg: DaySegment; lane: { col: number; cols: number; span: number }; c: Ctx; stop: boolean }) {
  const e = derived(() => seg.event)
  const len = derived(() => seg.e - seg.s)
  const state_ = derived(() => (c.moving.value?.id === seg.id ? 'moving' : c.drag.value?.id === seg.id ? 'dragging' : undefined))
  const shift = derived(() => dstShift(e.value, c.tz()))
  const style = derived(() => `${tint(e.value.cal)};--_top:${hours(seg.s)};--_h:${hours(len.value)}${state_.value ? '' : `;--_col:${lane.col};--_cols:${lane.cols};--_span:${lane.span}`}`)
  return (
    <div data-part="event" data-sweep="" data-cal={e.value.cal ?? 1} data-id={seg.id} role="button" tabindex={stop ? '0' : '-1'} aria-roledescription="event" aria-haspopup="dialog" aria-expanded={c.popOpen.value && c.popped.value === seg.id ? 'true' : undefined} aria-keyshortcuts="Enter M Delete" data-tentative={e.value.tentative ? '' : undefined} data-declined={e.value.declined ? '' : undefined} data-locked={e.value.locked ? '' : undefined} data-short={len.value <= 30 ? '' : undefined} data-state={state_.value} style={style.value}>
      <SweepParts />
      <span class="sr">{c.name(e.value)}{shift.value ? '. Clocks change during this event; times are wall-clock' : ''}</span>
      <span data-part="event-title" aria-hidden="true">{e.value.recurrence && <RepeatGlyph />}{e.value.recurrence ? ' ' : ''}{e.value.title}</span>
      <span data-part="event-time" aria-hidden="true">{c.span(seg.s, seg.e)}{shift.value ? ' · clocks change' : ''}</span>
      {len.value >= 90 && e.value.location && <span data-part="event-meta" aria-hidden="true">{e.value.location}</span>}
      {!e.value.locked && !c.p.readOnly && <span data-part="resize" aria-hidden="true"></span>}
    </div>
  )
}

function Column({ day, c, stop, weekend }: { day: string; c: Ctx; stop: string | null; weekend: boolean }) {
  const hrs = derived(() => c.p.workingHours ?? [480, 1080])
  const segs = derived(() => {
    const v = c.preview.value
    return daySegments(c.visible.value.map(e => (v?.id === e.id && !e.allDay ? { ...e, ...slotTimes(v) } : e)), day)
  })
  const lanes = derived(() => layoutDay(segs.value.filter(s => s.id !== c.preview.value?.id)))
  const today = derived(() => day === c.env.today.value)
  const nowAt = derived(() => { const n = c.now.value; return n && dateOf(n) === day ? minuteOf(n) : null })
  const ghost = derived(() => { const v = c.drag.value; return v?.origin && v.origin.date === day ? v.origin : null })
  const draft = derived(() => { const v = c.drag.value; return v?.mode === 'create' && v.date === day ? v : null })
  const read = derived(() => {
    const v = c.preview.value
    if (!v || v.date !== day) return null
    return { top: hours(v.s), text: v.mode === 'resize' ? `${c.span(v.s, v.e)} · ${longDuration(v.e - v.s)}` : `${fmt(v.date, { weekday: 'short' }, c.env.locale.value)} ${c.span(v.s, v.e)}` }
  })
  return (
    <div data-part="col" role="gridcell" data-date={day} data-weekend={weekend ? '' : undefined} aria-current={today.value ? 'date' : undefined}>
      <span data-part="band" style={`--_top:0px;--_h:${hours(hrs.value[0]!)}`}></span>
      <span data-part="band" style={`--_top:${hours(hrs.value[1]!)};--_h:${hours(1440 - hrs.value[1]!)}`}></span>
      {ghost.value && <span data-part="ghost" style={`--_top:${hours(ghost.value.s)};--_h:${hours(ghost.value.e - ghost.value.s)}`}></span>}
      {segs.value.map(s => <EventBlock key={s.id} seg={s} lane={lanes.value.get(s.id) ?? { col: 0, cols: 1, span: 1 }} c={c} stop={stop === s.id} />)}
      {draft.value && <span data-part="draft" style={`--_top:${hours(draft.value.s)};--_h:${hours(draft.value.e - draft.value.s)}`}>New event · {c.span(draft.value.s, draft.value.e)}</span>}
      {read.value && <span data-part="readout" role="status" style={`inset-block-start:${read.value.top}`}>{read.value.text}</span>}
      {nowAt.value !== null && <span data-part="now" style={`--_top:${hours(nowAt.value)}`} aria-hidden="true"></span>}
    </div>
  )
}

/** Week and Day (07 §2.5): an APG grid, day columns as columnheaders, events inside gridcells. */
function TimeGrid({ c, count }: { c: Ctx; count: number }) {
  const days = derived(() => viewDays(c.view.value, c.date.value, c.first.value, count) as string[])
  const list = derived(() => c.visible.value.filter(e => days.value.some(d => dateOf(e.start) <= d && dateOf(e.end) >= d)))
  const stop = derived(() => { const id = c.stop.value; return (id && list.value.find(e => e.id === id)?.id) || [...list.value].sort((a, b) => (a.start < b.start ? -1 : 1))[0]?.id || null })
  const bars = derived(() => allDayBars(c.visible.value, days.value))
  const nowAt = derived(() => { const n = c.now.value; return n && days.value.includes(dateOf(n)) ? minuteOf(n) : null })
  // a day's least width grows by half for each event that runs beside another (up to four), so side-by-side events
  // still read; past the box's width the week scrolls sideways (calendar.css)
  const widths = derived(() => days.value.map(d => {
    const lanes = Math.max(1, ...[...layoutDay(daySegments(c.visible.value, d)).values()].map(l => l.cols))
    return 1 + (Math.min(lanes, 4) - 1) / 2
  }))
  const tracks = derived(() => `--_tracks:var(--warp-cal-gutter) ${widths.value.map(f => `minmax(calc(var(--warp-cal-day-min) * ${f}), 1fr)`).join(' ')};--_week-w:calc(var(--warp-cal-gutter) + var(--warp-cal-day-min) * ${widths.value.reduce((x, y) => x + y, 0)})`)
  let cols: HTMLDivElement | undefined
  let scroller: HTMLDivElement | undefined
  use(calendarDrag, () => cols, () => c.dragOpts())
  use(edges, () => scroller) // a week wider than its box shades the side with more, past the hours
  // open half an hour before the working day, and sideways at the shown date when the week is wider than its box. The root
  // bounds its own height (calendar.css), so this scrolls even when no parent gives the calendar a height
  onMount(() => {
    if (!scroller || !cols) return
    scroller.scrollTop = (cols.offsetHeight / 1440) * Math.max(0, (c.p.workingHours ?? [480, 1080])[0] - 30)
    const col = cols.querySelector<HTMLElement>(`[data-part="col"][data-date="${untrack(() => c.date.value)}"]`)
    const gutter = cols.querySelector<HTMLElement>('[data-part="gutter"]')?.offsetWidth ?? 0
    if (col && scroller.scrollWidth > scroller.clientWidth) scroller.scrollLeft = Math.max(0, col.offsetLeft - gutter)
  })
  const onKey = (e: KeyboardEvent) => c.eventKeys(e, { days: days.value, next: (k, id) => eventKey(k, id, list.value, getComputedStyle(e.target as Element).direction === 'rtl') })
  const onChip = (e: MouseEvent) => { const el = (e.target as Element).closest?.<HTMLElement>('[data-id]'); if (el) c.openPopover(el.dataset.id!, el) }
  return (
    <div data-scope="edges" data-part="grid" data-view="time" role="grid" aria-label={fmt(days.value[0], { month: 'long', year: 'numeric' }, c.env.locale.value)} style={`--_days:${days.value.length};--warp-edges-start:var(--warp-cal-gutter);${tracks.value}`} onKeyDown={onKey}>
      <div ref={(n: any) => (scroller = n)} data-part="scroller">
        <div data-part="top">
          <div data-part="head" role="row">
            <span data-part="corner" aria-hidden="true"></span>
            {days.value.map(d => <div key={d} data-part="dayhead" role="columnheader" aria-label={fmt(d, { weekday: 'long', month: 'short', day: 'numeric' }, c.env.locale.value)} aria-current={d === c.env.today.value ? 'date' : undefined}><span>{fmt(d, { weekday: 'short' }, c.env.locale.value)}</span><b>{ymd(d)[2]}</b></div>)}
          </div>
          <div data-part="allday" role="row" onClick={onChip}>
            <span data-part="gutter-label" role="rowheader">All day</span>
            {days.value.map((d, i) => <div key={d} data-part="allday-cell" style={`grid-column:${i + 2};grid-row:1 / span ${Math.max(1, ...bars.value.map(b => b.row + 1))}`}></div>)}
            {bars.value.map(b => <div key={b.id} data-part="chip" data-cal={b.event.cal ?? 1} data-id={b.id} role="gridcell" tabindex={stop.value === b.id ? '0' : '-1'} aria-label={c.name(b.event)} style={`${tint(b.event.cal)};grid-column:${b.col + 2} / span ${b.span};grid-row:${b.row + 1}`}>{b.event.title}</div>)}
          </div>
        </div>
        <div ref={(n: any) => (cols = n)} data-part="cols" role="row">
          <div data-part="gutter" aria-hidden="true">
            {Array.from({ length: 23 }, (_, i) => i + 1).map(h => <span key={h} data-part="hour" style={`top:${hours(h * 60)}`}>{c.time(h * 60)}</span>)}
            {nowAt.value !== null && <span data-part="now-label" style={`--_top:${hours(nowAt.value)}`}>{c.time(nowAt.value)}</span>}
          </div>
          {days.value.map(d => <Column key={d} day={d} c={c} stop={stop.value} weekend={isWeekend(dow(d), c.env.locale.value)} />)}
        </div>
      </div>
    </div>
  )
}

function MonthGrid({ c }: { c: Ctx }) {
  const hint = uid('month')
  const weeks = derived(() => monthCells(c.date.value, c.first.value))
  const onDay = (iso: string) => eventsOn(c.visible.value, iso)
  const heads = derived(() => weekdays(c.first.value, c.env.locale.value))
  const cursor = state(untrack(() => c.date.value))
  watch(() => c.date.value, d => { cursor.value = d })
  let grid: HTMLDivElement | undefined
  const more = state<{ iso: string; list: CalEvent[] } | null>(null)
  const moreOpen = state(false)
  const moreAt = state<HTMLElement | undefined>(undefined)
  let panel: HTMLDivElement | undefined
  use(popover, () => panel, () => ({ open: moreOpen.value, trigger: moreAt.value!, side: 'bottom' as const, align: 'start' as const, onClose: () => (moreOpen.value = false) }))
  // The weeks share the height the calendar has (calendar.css), so a whole month is in view: a day shows the chips its
  // row has room for, and "+N more" for the rest. Until measured, three and "+N more" (fit 4), as the server renders.
  const fit = state(4)
  onMount(() => {
    const win = grid?.ownerDocument.defaultView
    if (!grid || !win || typeof win.ResizeObserver !== 'function') return
    const measure = () => {
      const cell = grid!.querySelector<HTMLElement>('[role="gridcell"]')
      if (!cell) return
      const cs = win.getComputedStyle(cell)
      // a phone's days draw dots that wrap in a row (calendar.css): three and "+N more", as before
      if (cs.display !== 'grid' || cs.gridTemplateColumns.split(' ').length > 1) { fit.value = 4; return }
      const chip = 22 // 20px chips, 2px gap
      const room = cell.clientHeight - parseFloat(cs.paddingBlockStart) - parseFloat(cs.paddingBlockEnd) - (cell.querySelector<HTMLElement>('[aria-hidden="true"]:not([data-part])')?.offsetHeight ?? 18) - 2
      fit.value = Math.max(1, Math.floor((room + 2) / chip))
    }
    const ro = new win.ResizeObserver(measure)
    ro.observe(grid)
    onCleanup(() => ro.disconnect())
  })
  /** The chips a day shows, and how many go behind "+N more" (which takes a chip's room). */
  const shownOn = (list: CalEvent[]) => { const n = list.length <= fit.value ? list.length : Math.max(0, fit.value - 1); return { chips: list.slice(0, n), more: list.length - n } }
  const openDay = (iso: string) => { c.date.set(iso); c.view.set('day'); c.say(`Day view, ${fmt(iso, { dateStyle: 'full' }, c.env.locale.value)}`) }
  const onKey = (e: KeyboardEvent) => {
    const cell = (e.target as Element).closest?.<HTMLElement>('[role="gridcell"]')
    if (!cell) return
    const to = gridKey(e.key, e.shiftKey, cursor.value, c.first.value, getComputedStyle(cell).direction === 'rtl')
    if (!to) return
    e.preventDefault()
    if (to === 'pick') return openDay(cursor.value)
    cursor.value = to
    if (monthStart(to) !== monthStart(c.date.value)) c.date.set(to)
    flush()
    grid?.querySelector<HTMLElement>('[role="gridcell"][tabindex="0"]')?.focus()
  }
  const onClick = (e: MouseEvent) => {
    const t = e.target as Element
    const btn = t.closest?.<HTMLElement>('[data-part="more"]')
    const cell = t.closest?.<HTMLElement>('[role="gridcell"]')
    if (!cell) return
    if (btn) {
      more.value = { iso: cell.dataset.date!, list: eventsOn(c.visible.value, cell.dataset.date!) }
      moreAt.value = btn
      moreOpen.value = true
      return
    }
    openDay(cell.dataset.date!)
  }
  const label = (iso: string, list: CalEvent[]) => `${fmt(iso, { weekday: 'long', month: 'long', day: 'numeric' }, c.env.locale.value)}, ${list.length ? `${list.length} events: ${list.map(e => e.title).join(', ')}` : 'no events'}${iso === c.env.today.value ? ', today' : ''}`
  return (
    <div data-part="grid" style="--warp-cal-gutter:0px;--_days:7">
      <div data-part="head" aria-hidden="true"><span></span>{heads.value.map(h => <div key={h[0]} data-part="dayhead"><span>{h[1]}</span></div>)}</div>
      <span aria-hidden="true"></span>
      <div data-part="scroller">
        <div ref={n => (grid = n)} data-part="month" role="grid" aria-label={fmt(c.date.value, { month: 'long', year: 'numeric' }, c.env.locale.value)} aria-describedby={hint} onKeyDown={onKey} onClick={onClick}>
          {weeks.value.map(w => (
            <div key={w.key} role="row">
              {w.cells.map(x => (
                <div key={x.iso} data-part="day-cell" role="gridcell" tabindex={x.iso === cursor.value ? '0' : '-1'} data-date={x.iso} data-outside={x.outside ? '' : undefined} aria-current={x.iso === c.env.today.value ? 'date' : undefined}>
                  <span class="sr">{label(x.iso, onDay(x.iso))}</span>
                  <span aria-hidden="true">{ymd(x.iso)[2]}</span>
                  {shownOn(onDay(x.iso)).chips.map(e => <span key={e.id} data-part="chip" data-cal={e.cal ?? 1} style={tint(e.cal)} aria-hidden="true">{e.title}</span>)}
                  {shownOn(onDay(x.iso)).more > 0 && <button type="button" data-part="more" tabindex="-1" aria-hidden="true">+{shownOn(onDay(x.iso)).more} more</button>}
                </div>
              ))}
            </div>
          ))}
        </div>
      </div>
      <span class="sr" id={hint}>Arrow keys move between days, Home and End to the week's ends, Page Up and Page Down by month, Enter opens the day.</span>
      <div ref={n => (panel = n)} data-scope="popover" data-part="content" popover="manual" role="dialog" aria-label={more.value ? fmt(more.value.iso, { month: 'long', day: 'numeric' }, c.env.locale.value) : 'Events'}>
        {more.value && <div class="stack">{more.value.list.map(e => <Button key={e.id} emphasis="ghost" tone="neutral" size="sm" onClick={() => { moreOpen.value = false; c.say(c.name(e)); openDay(dateOf(e.start)) }}>{e.title}</Button>)}</div>}
      </div>
    </div>
  )
}

function AgendaView({ c }: { c: Ctx }) {
  const days = derived(() => viewDays('week', c.date.value, c.first.value))
  return (
    <div data-part="scroller">
      <div data-scope="agenda">
        <div data-part="page" onClick={(e: MouseEvent) => { const el = (e.target as Element).closest?.<HTMLElement>('[data-id]'); if (el) c.openPopover(el.dataset.id!, el) }} onKeyDown={(e: KeyboardEvent) => { const el = (e.target as Element).closest?.<HTMLElement>('[data-id]'); if (el && e.key === 'Enter') c.openPopover(el.dataset.id!, el) }}>
          {days.value.map(d => (
            <section key={d}>
              <div data-part="day-title"><h4>{fmt(d, { weekday: 'long' }, c.env.locale.value)}</h4><span class="muted">{fmt(d, { month: 'short', day: 'numeric' }, c.env.locale.value)}</span></div>
              <AgendaDay events={c.visible.value} day={d} now={c.now.value} locale={c.env.locale.value} hourCycle={c.p.hourCycle} label={fmt(d, { weekday: 'long' }, c.env.locale.value)} />
            </section>
          ))}
        </div>
      </div>
    </div>
  )
}

const STEP = 5 // a timeline lane's column, in minutes

/** Timeline (07 §2.5): rows of rooms or people over hours, one roving stop, the same drag on the x axis. */
function Timeline({ c }: { c: Ctx }) {
  const hint = uid('tl')
  const range = derived((): [number, number] => c.p.timeline ?? [480, 1080])
  const width = derived(() => range.value[1] - range.value[0])
  const slots = derived(() => Math.round(width.value / 60))
  const marks = derived(() => Array.from({ length: slots.value }, (_, i) => range.value[0] + i * 60))
  const day = derived(() => c.date.value)
  const rows = derived(() => c.p.resources ?? [])
  const segs = derived(() => {
    const pv = c.preview.value
    return daySegments(c.visible.value.map(e => (pv?.id === e.id ? { ...e, ...slotTimes(pv), resource: pv.resource } : e)), day.value)
  })
  const lane = (id: string) => segs.value.filter(s => s.event.resource === id)
  const order = derived(() => rows.value.map(r => lane(r.id).map(s => ({ id: s.id, s: s.s }))))
  const stop = derived(() => { const id = c.stop.value; return (id && order.value.flat().find(x => x.id === id)?.id) || order.value.flat()[0]?.id || null })
  const nowAt = derived(() => { const n = c.now.value; return n && dateOf(n) === day.value ? minuteOf(n) : null })
  let box: HTMLDivElement | undefined
  let scroller: HTMLDivElement | undefined
  use(calendarDrag, () => box, () => ({ ...c.dragOpts(), axis: 'x' as const, from: range.value[0], to: range.value[1] }))
  // an hour keeps a readable width (calendar.css) and the rows scroll sideways under their sticky names: a shadow says so
  use(edges, () => scroller)
  // a lane is a grid of five-minute columns: a booking spans its minutes, and the row grows to hold its whole name
  const cols = derived(() => Math.max(1, Math.round(width.value / STEP)))
  const place = (s: DaySegment) => {
    const [from, to] = range.value
    const a = Math.min(Math.max(s.s, from), to - STEP), b = Math.max(Math.min(s.e, to), a + STEP)
    return `grid-column:${Math.round((a - from) / STEP) + 1} / span ${Math.max(1, Math.round((b - a) / STEP))}`
  }
  // names wrap between words, never inside one: when a word is wider than its booking, every hour widens a step
  // (--_fit) until each word fits, and the rows scroll sideways for it rather than cut a name
  const fit = () => {
    if (!box || untrack(() => c.drag.value || c.moving.value)) return
    const doc = box.ownerDocument
    const titles = () => [...box!.querySelectorAll<HTMLElement>('[data-part="lane"] [data-part="event-title"]')].filter(t => t.offsetWidth)
    const cut = () => titles().some(t => { const r = doc.createRange(); r.selectNodeContents(t); const w = r.getBoundingClientRect(), b = t.getBoundingClientRect(); return w.right > b.right + 0.5 || w.left < b.left - 0.5 })
    box.style.removeProperty('--_fit')
    const lane = box.querySelector<HTMLElement>('[data-part="lane"]')
    if (!lane) return
    let hour = lane.getBoundingClientRect().width / Math.max(1, untrack(() => slots.value))
    for (let i = 0; i < 24 && cut(); i++) box.style.setProperty('--_fit', `${(hour += 8)}px`)
  }
  let frame = 0
  const refit = () => { if (typeof requestAnimationFrame === 'undefined') return; cancelAnimationFrame(frame); frame = requestAnimationFrame(fit) }
  watch(() => [segs.value, rows.value, range.value], refit)
  onMount(() => {
    refit()
    void box?.ownerDocument.fonts?.ready.then(refit)
    if (typeof ResizeObserver === 'undefined' || !scroller) return
    let w = 0
    const ro = new ResizeObserver(r => { const n = Math.round(r[0].contentRect.width); if (n !== w) { w = n; refit() } })
    ro.observe(scroller)
    onCleanup(() => { ro.disconnect(); cancelAnimationFrame(frame) })
  })
  const onKey = (e: KeyboardEvent) => c.eventKeys(e, { resources: (c.p.resources ?? []).map(r => r.id), next: (k, id) => laneKey(k, id, order.value) })
  // a booking carries its name, times and start; which show is its own width (calendar.css): its whole name with its
  // times under it, its whole name, or only the start time when it is too narrow for a word
  return (
    <div data-scope="edges" data-part="timeline-edges">
      <div ref={n => (scroller = n)} data-part="scroller">
        <div ref={n => (box = n)} data-part="timeline" role="grid" aria-label={`${(c.p.resources ?? []).length ? 'Resources' : 'Timeline'}, ${fmt(day.value, { weekday: 'long', month: 'short', day: 'numeric' }, c.env.locale.value)}`} aria-describedby={hint} onKeyDown={onKey} style={`--_slots:${slots.value}`}>
          <span data-part="corner" aria-hidden="true"></span>
          <div data-part="marks" class="muted" aria-hidden="true" style={`display:grid;grid-template-columns:repeat(${marks.value.length},1fr)`}>{marks.value.map(m => <span key={m}>{c.time(m)}</span>)}</div>
          {rows.value.map(r => (
            <div key={r.id} role="row">
              <div data-part="lane-label" role="rowheader"><b>{r.name}</b>{r.meta && <span class="muted">{r.meta}</span>}</div>
              <div data-part="lane" data-resource={r.id} data-date={day.value} style={`--_slots:${slots.value};--_cols:${cols.value}`}>
                {lane(r.id).map(s => (
                  <div key={s.id} data-part="event" data-cal={s.event.cal ?? 1} data-short="" data-id={s.id} role="gridcell" tabindex={stop.value === s.id ? '0' : '-1'} data-state={c.moving.value?.id === s.id ? 'moving' : c.drag.value?.id === s.id ? 'dragging' : undefined} style={`${tint(s.event.cal)};${place(s)}`}>
                    <span class="sr">{`${s.event.title}, ${r.name}, ${c.span(s.s, s.e)}`}</span>
                    <span data-part="event-title" aria-hidden="true">{s.event.title}</span>
                    <span data-part="event-time" aria-hidden="true">{c.span(s.s, s.e)}</span>
                    <span data-part="event-start" aria-hidden="true">{c.time(s.s)}</span>
                  </div>
                ))}
                {nowAt.value !== null && nowAt.value >= range.value[0] && nowAt.value <= range.value[1] && <span data-part="now" aria-hidden="true" style={`--_top:0;inset-block:0;inset-inline-start:${((nowAt.value - range.value[0]) / width.value) * 100}%;inline-size:0;block-size:auto;border:0;border-inline-start:var(--warp-border-emphasis) solid var(--warp-color-sweep)`}></span>}
              </div>
            </div>
          ))}
        </div>
        <span class="sr" id={hint}>Left and right move along a row, up and down to the nearest booking in the next row. M moves a booking.</span>
      </div>
    </div>
  )
}

/** The rail's navigator (07 §2.5): an APG date grid, one stop on the focused day. Enter or a press moves the main view. */
function MiniMonth({ c }: { c: Ctx }) {
  const id = uid('mini')
  const cursor = state(untrack(() => c.date.value))
  const picked = state(untrack(() => c.date.value))
  const note = state('')
  watch(() => c.date.value, d => { cursor.value = d; picked.value = d })
  const weeks = derived(() => monthWeeks(cursor.value, c.first.value).map((days, r) => ({ key: `${cursor.value.slice(0, 7)}-${r}`, days: days.map((iso, k) => ({ iso, k: iso ?? `${cursor.value.slice(0, 7)}-${r}-${k}` })) })))
  const heads = derived(() => weekdays(c.first.value, c.env.locale.value))
  const inWeek = (iso: string) => viewDays('week', c.date.value, c.first.value).includes(iso as IsoDate)
  let grid: HTMLDivElement | undefined
  const pick = (iso: string) => {
    picked.value = iso
    if (inWeek(iso)) { note.value = ''; c.date.set(iso); c.view.set('day'); c.say(`Day view, ${fmt(iso, { dateStyle: 'full' }, c.env.locale.value)}`) }
    else { c.date.set(iso); note.value = `Moved to ${fmt(iso, { month: 'short', day: 'numeric' }, c.env.locale.value)}.` }
  }
  const onKey = (e: KeyboardEvent) => {
    const to = gridKey(e.key, e.shiftKey, cursor.value, c.first.value, getComputedStyle(e.currentTarget as Element).direction === 'rtl')
    if (!to) return
    e.preventDefault()
    if (to === 'pick') return pick(cursor.value)
    cursor.value = to
    flush()
    grid?.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.focus()
  }
  const name = (iso: string) => `${dayState(iso as IsoDate, { mode: 'single', value: null, today: c.env.today.value, locale: c.env.locale.value }).name}${inWeek(iso) ? ', in the shown week' : ''}`
  return (
    <>
      <div class="row">
        <b id={`${id}-t`} aria-live="polite">{fmt(cursor.value, { month: 'long', year: 'numeric' }, c.env.locale.value)}</b>
        <span style="flex:1"></span>
        <Button emphasis="ghost" tone="neutral" size="sm" icon={LeftIcon} label="Previous month" onClick={() => (cursor.value = stepDate('month', cursor.value, -1))} />
        <Button emphasis="ghost" tone="neutral" size="sm" icon={RightIcon} label="Next month" onClick={() => (cursor.value = stepDate('month', cursor.value, 1))} />
      </div>
      <div ref={n => (grid = n)} data-part="mini" role="grid" aria-labelledby={`${id}-t`} aria-describedby={`${id}-h`} onKeyDown={onKey} onClick={(e: MouseEvent) => { const d = (e.target as Element).closest?.<HTMLElement>('[data-day]')?.dataset.day; if (d) { cursor.value = d; pick(d) } }}>
        <div role="row">{heads.value.map(h => <span key={h[0]} role="columnheader"><span aria-hidden="true">{h[0][0]}</span><span class="sr">{h[0]}</span></span>)}</div>
        {weeks.value.map(w => (
          <div key={w.key} role="row">
            {w.days.map(d => (d.iso
              ? <span key={d.k} role="gridcell" data-day={d.iso} tabindex={d.iso === cursor.value ? '0' : '-1'} aria-selected={d.iso === picked.value ? 'true' : 'false'} aria-current={d.iso === c.env.today.value ? 'date' : undefined} data-in-range={inWeek(d.iso) ? '' : undefined} aria-label={name(d.iso)}>{ymd(d.iso)[2]}</span>
              : <span key={d.k} role="gridcell" data-outside=""></span>))}
          </div>
        ))}
      </div>
      <span class="sr" id={`${id}-h`}>Arrow keys move by day and week, Page Up and Page Down by month, Enter opens the day.</span>
      <p data-part="mini-note" aria-live="polite">{note.value}</p>
    </>
  )
}

/** The toolbar's zone chip: TimeZoneSelect (04 §2) in a popover. */
function ZoneChip({ c }: { c: Ctx }) {
  const id = uid('zone')
  const open = state(false)
  const built = state(false)
  let chip: HTMLButtonElement | undefined
  let panel: HTMLDivElement | undefined
  use(popover, () => panel, () => ({ open: open.value, trigger: chip!, side: 'bottom' as const, align: 'end' as const, onClose: () => (open.value = false) }))
  return (
    <>
      <Tooltip content={`Times shown in ${c.zone.value}`}><button ref={n => (chip = n)} type="button" data-part="tz" aria-haspopup="dialog" aria-expanded={open.value ? 'true' : 'false'} aria-controls={id} onClick={() => { built.value = true; open.value = !open.value }}><GlobeIcon />{c.zoneLabel.value}</button></Tooltip>
      <div ref={n => (panel = n)} id={id} data-scope="popover" data-part="content" popover="manual" role="dialog" aria-label="Time zone">
        {built.value && <TimeZoneSelect label="Time zone" value={c.zone.value} referenceDate={c.date.value} today={c.env.today.value} locale={c.env.locale.value} onValueChange={(z: string | null) => { c.zone.set(z); open.value = false; c.say(`Times shown in ${z}`) }} />}
      </div>
    </>
  )
}

/**
 * Calendar (07 §2, `#cal-desk`): toolbar, rail, and Month, Week, Day, Agenda, Timeline and Year behind APG tabs. Drag
 * moves, resizes and creates on a 15-minute snap; `M` is the keyboard move mode, a long press opens the MoveSheet, and
 * the editor's fields do it all without either. `today` and `now` are props or arrive after mount, so hydration writes
 * nothing. A week keeps all seven days at a readable width and scrolls sideways under its hours when its box is narrower,
 * and below 1000px the mini month moves into the title's popover.
 */
export function Calendar(p: CalendarProps) {
  const id = uid('cal')
  const c = useCalendar(untrack(() => p))
  const views = derived(() => p.views ?? ALL)
  let root: HTMLDivElement | undefined
  let tabs: HTMLDivElement | undefined
  const width = useWidth(() => root)
  const tablet = derived(() => width.value > 0 && width.value < 1000)
  use(indicator, () => tabs, () => ({ selected: '[aria-selected="true"]', x: '--_ix', w: '--_iw', at: c.view.value }))
  use(overflow, () => tabs, () => tabs?.querySelector<HTMLElement>('[aria-selected="true"]') ?? null)
  const title = derived(() => {
    const v = c.view.value, d = c.date.value, l = c.env.locale.value
    if (v === 'year') return ymd(d)[0].toString()
    if (v === 'day' || v === 'timeline') return fmt(d, { month: 'long', day: 'numeric', year: 'numeric' }, l)
    return fmt(d, { month: 'long', year: 'numeric' }, l)
  })
  const unit = derived(() => ({ month: 'month', week: 'week', day: 'day', agenda: 'week', timeline: 'day', year: 'year' })[c.view.value])
  const week = derived(() => (c.view.value === 'week' ? `Week ${isoWeek(c.date.value).week}` : ''))
  const step = (d: number) => c.date.set(stepDate(c.view.value, c.date.value, d))
  const setView = (v: CalView) => { if (v !== c.view.value) { c.view.set(v); c.say(`${LABEL[v]} view`) } }
  const onTabKey = (e: KeyboardEvent) => {
    const list = views.value
    const to = nextIndex(e.key, list.indexOf(c.view.value), list.length, { rtl: getComputedStyle(e.currentTarget as Element).direction === 'rtl' })
    if (to < 0) return
    e.preventDefault()
    setView(list[to]!)
    flush()
    tabs?.querySelector<HTMLElement>('[aria-selected="true"]')?.focus()
  }
  const createNow = () => { const d = c.date.value; c.newEvent(`${d}T13:00`, `${d}T14:00`) }
  const openDay = (iso: IsoDate) => { c.date.set(iso); c.view.set('day'); return true }
  const openMonth = (iso: IsoDate) => { c.date.set(iso); c.view.set('month'); return true }
  const toggle = (cal: number, on: boolean) => { c.off.value = on ? c.off.value.filter(x => x !== cal) : [...c.off.value, cal] }
  const confirmDelete = () => { const e = c.doomed.value; c.askDelete.value = false; if (e) { c.p.onDelete?.(e); c.say(`Deleted ${e.title}`) } }
  const applyScope = () => { const a = c.pendingScope.value; c.scopeOpen.value = false; c.pendingScope.value = null; a?.run(c.scope.value) }
  const dropScope = () => { const a = c.pendingScope.value; c.scopeOpen.value = false; c.pendingScope.value = null; a?.undo?.() }
  const saved = (e: CalEvent) => {
    const d = c.draft.value
    if (d?.isNew) { p.onCreate?.(e); c.say(`Created ${e.title}`); return }
    const run = (s?: RecurrenceScope) => { p.onEdit?.(e, s); c.say(`Saved ${e.title}`) }
    if (d?.event.recurrence) { c.scope.value = 'this'; c.pendingScope.value = { run, verb: 'Save' }; c.scopeOpen.value = true } else run()
  }
  const zoneNow = (z: string) => { const n = c.now.value; return n ? c.time(minuteOf(c.tz() ? toZone(n, c.tz()!, z) : n)) : '' }
  return (
    <div ref={n => { root = n; c.bindRoot(n) }} data-scope="calendar" data-part="root">
      <div data-part="app-bar" class="row">
        <Button emphasis="ghost" tone="neutral" size="sm" icon={LeftIcon} label={`Previous ${unit.value}`} onClick={() => step(-1)} />
        <Button emphasis="ghost" tone="neutral" size="sm" icon={RightIcon} label={`Next ${unit.value}`} onClick={() => step(1)} />
        <Button emphasis="outline" tone="neutral" size="sm" onClick={() => c.date.set(c.env.today.value)}>Today</Button>
        {tablet.value
          ? <Popover label={title.value} title="Go to a date" trigger={{ emphasis: 'ghost', tone: 'neutral', size: 'sm' }}><span data-scope="calendar"><MiniMonth c={c} /></span></Popover>
          : <h3 data-part="app-title"><span data-part="range-label">{title.value} <small>{week.value && `· ${week.value}`}</small></span></h3>}
        <span data-part="spacer"></span>
        {p.live && <LiveStatus state={p.live} label="Calendar sync">{p.live === 'live' ? 'Synced' : undefined}</LiveStatus>}
        {c.zone.value && <ZoneChip c={c} />}
        <div data-scope="tabs" data-variant="pill" data-part="root">
          <div ref={n => (tabs = n)} data-part="list" role="tablist" aria-label="Calendar view" onKeyDown={onTabKey}>
            {views.value.map(v => <button key={v} type="button" data-part="trigger" role="tab" id={`${id}-${v}`} aria-controls={`${id}-main`} aria-selected={v === c.view.value ? 'true' : 'false'} tabindex={v === c.view.value ? undefined : '-1'} onClick={() => setView(v)}>{LABEL[v]}</button>)}
            <span data-part="indicator" aria-hidden="true" data-instant=""></span>
          </div>
        </div>
        {!p.readOnly && p.onCreate && <Button size="sm" onClick={createNow}><PlusIcon />New event</Button>}
      </div>
      <div data-part="layout" style="min-block-size:0">
        <aside data-part="rail" aria-label="Calendars">
          {!tablet.value && <MiniMonth c={c} />}
          {p.calendars && (
            <div class="stack">
              <span data-part="eyebrow">My calendars</span>
              <ul data-part="sources">{p.calendars.map(s => <li key={s.id}><label data-cal={s.id}><input type="checkbox" checked={!c.off.value.includes(s.id)} onChange={(e: Event) => toggle(s.id, (e.currentTarget as HTMLInputElement).checked)} />{s.name}</label></li>)}</ul>
            </div>
          )}
          {p.zones && (
            <div class="stack">
              <span data-part="eyebrow">Time zones</span>
              {p.zones.map(z => <span key={z.zone} class="row"><span>{z.label}</span><span style="flex:1"></span><span class="muted">{zoneNow(z.zone)}</span></span>)}
            </div>
          )}
        </aside>
        <div data-part="main" id={`${id}-main`} role="tabpanel" aria-labelledby={`${id}-${c.view.value}`} style="min-block-size:0;min-inline-size:0;display:grid;position:relative">
          {c.view.value === 'week' || c.view.value === 'day'
            ? <TimeGrid c={c} count={7} />
            : c.view.value === 'month'
              ? <MonthGrid c={c} />
              : c.view.value === 'agenda'
                ? <AgendaView c={c} />
                : c.view.value === 'timeline'
                  ? <Timeline c={c} />
                  : <div data-part="year-wrap"><YearView label="Year view" counts={c.counts.value} events={c.all.value} today={c.env.today.value} locale={c.env.locale.value} hourCycle={p.hourCycle} firstDayOfWeek={c.first.value} openDay={openDay} openMonth={openMonth} /></div>}
        </div>
      </div>
      <EventPopover open={c.popOpen} event={c.popped.value ? c.shown(c.popped.value) ?? null : null} anchor={() => c.anchor.value} zoneLabel={c.zoneLabel.value} locale={c.env.locale.value} hourCycle={p.hourCycle} side={c.view.value === 'agenda' ? 'bottom' : 'right'} onEdit={p.onEdit && !p.readOnly ? c.edit : undefined} onDelete={p.onDelete && !p.readOnly ? c.remove : undefined} onJoin={p.onJoin} />
      <EventEditor open={c.editing} event={c.draft.value?.event ?? null} isNew={c.draft.value?.isNew} calendars={p.calendars} timeZone={c.zone.value ?? undefined} locale={c.env.locale.value} today={c.env.today.value} onSave={saved} />
      <MoveSheet open={c.sheet} event={c.sheetFor.value} events={c.all.value} firstDayOfWeek={c.first.value} locale={c.env.locale.value} hourCycle={p.hourCycle} onMove={(e, to) => c.change(e.id, to, 'move', 'touch')} />
      <Modal open={c.askDelete} alert size="sm" tone="critical" title={`Delete ${c.doomed.value?.title ?? 'event'}?`} description="It's removed for everyone on it." footer={<><Button emphasis="outline" tone="neutral" autofocus onClick={() => (c.askDelete.value = false)}>Cancel</Button><Button tone="critical" onClick={confirmDelete}>Delete</Button></>}></Modal>
      <Modal open={c.scopeOpen} size="sm" title={`${c.pendingScope.value?.verb ?? 'Change'} repeating event`} footer={<><Button emphasis="outline" tone="neutral" onClick={dropScope}>Cancel</Button><Button onClick={applyScope}>{c.pendingScope.value?.verb ?? 'Apply'}</Button></>}>
        <Segmented label="Apply to" value={c.scope.value} onChange={v => (c.scope.value = v)} options={[{ value: 'this', label: 'This event' }, { value: 'following', label: 'This and following' }, { value: 'all', label: 'All' }]} />
      </Modal>
    </div>
  )
}

