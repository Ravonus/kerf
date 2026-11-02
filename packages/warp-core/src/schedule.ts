// Calendar, booking and planner logic (07 §2, §6.4): events as plain data, their lane layout, snapping, ranges and
// overlaps, and the pointer actions a binding attaches. Wall times are `YYYY-MM-DDTHH:MM` strings, minutes are minutes
// since midnight on a day. No framework, and nothing here reads the clock unless it is asked to.
import { gridKey } from './calendar'
import { addDays, addMonths, clamp, daysBetween, dow, fmt, fmtTime, fromMinutes, minutes, monthEnd, monthStart, offsetAt, pad, toIso, type IsoDate, type IsoTime } from './temporal'

export type CalView = 'month' | 'week' | 'day' | 'agenda' | 'timeline' | 'year'

/** 07 §2.2. `start`/`end` are wall date-times; an all-day event holds dates and its `end` is its last day. */
export interface CalEvent {
  id: string
  title: string
  start: string
  end: string
  allDay?: boolean
  /** The source, 1–8 (`data-cal`). */
  cal?: number
  tentative?: boolean
  locked?: boolean
  declined?: boolean
  /** An RRULE. */
  recurrence?: string | null
  /** The zone `start` and `end` are written in, when it isn't the calendar's. */
  tz?: string
  location?: string
  attendees?: string[]
  video?: string | boolean
  /** Timeline row. */
  resource?: string | undefined
}
export type Slot = { date: string; s: number; e: number; resource?: string | undefined }
export type DaySegment = { event: CalEvent; id: string; s: number; e: number; head: boolean; tail: boolean }
export type Lane = { col: number; cols: number; span: number }
/** A pair of minutes, start then end. */
export type Range = [number, number]

export const DAY = 1440
export const dateOf = (iso: string) => iso.slice(0, 10) as IsoDate
export const minuteOf = (iso: string) => (iso.length > 10 ? minutes(iso.slice(11, 16)) : 0)
/** A wall date-time from a date and minutes, which may run past either end of the day. */
export const at = (date: string, m: number) => { const d = Math.floor(m / DAY); return `${addDays(date, d)}T${fromMinutes(m - d * DAY)}` }
export const spanMinutes = (a: string, b: string) => daysBetween(dateOf(a), dateOf(b)) * DAY + minuteOf(b) - minuteOf(a)
export const slotOf = (e: CalEvent): Slot => ({ date: dateOf(e.start), s: minuteOf(e.start), e: minuteOf(e.start) + spanMinutes(e.start, e.end), resource: e.resource })
export const slotTimes = (s: Slot) => ({ start: at(s.date, s.s), end: at(s.date, s.e) })
export const longDuration = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ''}` : `${m} min`)
/** 24-hour by default, as in the specimen; `hourCycle` follows the locale's when `auto`. */
export const clock = (m: number, locale: string, hourCycle = 'h23') => fmtTime(fromMinutes(((m % DAY) + DAY) % DAY), locale, hourCycle)
export const clockRange = (a: number, b: number, locale: string, hourCycle?: string) => `${clock(a, locale, hourCycle)}–${clock(b, locale, hourCycle)}`

// -- zones ------------------------------------------------------------------------------------------------------------

const instant = (iso: string, zone: string) => {
  const wall = Date.parse(`${iso.slice(0, 16)}:00Z`)
  return wall - offsetAt(zone, wall - offsetAt(zone, wall) * 6e4) * 6e4
}
const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16)
/** A wall time in one zone, as a wall time in another. */
export const toZone = (iso: string, from: string, to: string) => { if (from === to) return iso.slice(0, 16); const t = instant(iso, from); return stamp(t + offsetAt(to, t) * 6e4) }
/** The event as the calendar's zone shows it. */
export const shownIn = (e: CalEvent, zone?: string): CalEvent => (e.allDay || !zone || !e.tz || e.tz === zone ? e : { ...e, start: toZone(e.start, e.tz, zone), end: toZone(e.end, e.tz, zone) })
/** Minutes the clocks change by inside the event, 0 when they don't. */
export function dstShift(e: CalEvent, zone?: string) {
  const z = e.tz ?? zone
  if (e.allDay || !z) return 0
  return offsetAt(z, instant(e.end, z)) - offsetAt(z, instant(e.start, z))
}
/** The wall time now in `zone` (the browser's own without one). Never call it during render. */
export function nowIn(zone?: string, when = Date.now()) {
  const t = new Intl.DateTimeFormat('en-CA', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).formatToParts(new Date(when))
  const of = (k: string) => t.find(p => p.type === k)!.value
  return `${of('year')}-${of('month')}-${of('day')}T${of('hour')}:${of('minute')}`
}

// -- ranges, overlap, layout ------------------------------------------------------------------------------------------

export const overlaps = (a: CalEvent, b: CalEvent) => a.id !== b.id && !a.allDay && !b.allDay && a.start < b.end && b.start < a.end
/** The events that collide with `e` at `slot` (or where it is). */
export function conflicts(events: CalEvent[], e: CalEvent, slot?: Slot) {
  const at_ = slot ? { ...e, ...slotTimes(slot) } : e
  return events.filter(x => overlaps(x, at_) && (!slot?.resource || x.resource === slot.resource))
}

/** Timed events on one day, clipped to it. */
export function daySegments(events: CalEvent[], day: string): DaySegment[] {
  const open = `${day}T00:00`, close = `${addDays(day, 1)}T00:00`
  const out: DaySegment[] = []
  for (const event of events) {
    if (event.allDay || event.start >= close || event.end <= open) continue
    const head = event.start >= open, tail = event.end <= close
    out.push({ event, id: event.id, s: head ? minuteOf(event.start) : 0, e: tail ? spanMinutes(open, event.end) : DAY, head, tail })
  }
  return out.sort((a, b) => a.s - b.s || b.e - a.e)
}

/**
 * Lanes (07 §2.2): within a cluster of overlapping events each takes the leftmost free lane, then spans right across
 * every lane that stays free beside it, so a long block is never squeezed by a short call.
 */
export function layoutDay<T extends { id: string; s: number; e: number }>(list: T[]) {
  const sorted = [...list].sort((a, b) => a.s - b.s || b.e - a.e)
  const out = new Map<string, Lane>()
  let cluster: T[] = [], end = -1
  const flush = () => {
    const lanes: number[] = []
    for (const x of cluster) {
      let c = lanes.findIndex(free => free <= x.s)
      if (c < 0) { c = lanes.length; lanes.push(0) }
      lanes[c] = x.e
      out.set(x.id, { col: c, cols: 0, span: 1 })
    }
    for (const x of cluster) {
      const o = out.get(x.id)!
      o.cols = lanes.length
      for (let c = o.col + 1; c < lanes.length; c++) {
        if (cluster.some(y => out.get(y.id)!.col === c && y.s < x.e && y.e > x.s)) break
        o.span++
      }
    }
    cluster = []
  }
  for (const x of sorted) {
    if (x.s >= end && cluster.length) flush()
    cluster.push(x)
    end = Math.max(end, x.e)
  }
  if (cluster.length) flush()
  return out
}

/** All-day bars over `days`: first column, span, and the row each lands on. */
export function allDayBars(events: CalEvent[], days: string[]) {
  const rows: number[] = []
  const bars: { event: CalEvent; id: string; col: number; span: number; row: number }[] = []
  const first = days[0]!, last = days[days.length - 1]!
  const list = events.filter(e => e.allDay && dateOf(e.start) <= last && dateOf(e.end) >= first).sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : a.end > b.end ? -1 : 1))
  for (const event of list) {
    const col = Math.max(0, daysBetween(first, dateOf(event.start)))
    const end = Math.min(days.length - 1, daysBetween(first, dateOf(event.end)))
    let row = rows.findIndex(free => free <= col)
    if (row < 0) { row = rows.length; rows.push(0) }
    rows[row] = end + 1
    bars.push({ event, id: event.id, col, span: end - col + 1, row })
  }
  return bars
}

/** Everything on a day: all-day events first, then by time. */
export function eventsOn(events: CalEvent[], day: string) {
  const all = events.filter(e => e.allDay && dateOf(e.start) <= day && dateOf(e.end) >= day)
  return [...all, ...daySegments(events, day).map(s => s.event)]
}

/** Merge touching and overlapping ranges. */
export function mergeRanges(list: Range[]) {
  const out: Range[] = []
  for (const [s, e] of [...list].sort((a, b) => a[0] - b[0])) {
    const last = out[out.length - 1]
    if (last && s <= last[1]) last[1] = Math.max(last[1], e)
    else out.push([s, e])
  }
  return out
}

// -- views ------------------------------------------------------------------------------------------------------------

export const startOfWeek = (date: string, weekStartsOn: number) => addDays(date, -((dow(date) - weekStartsOn + 7) % 7))
export const weekDates = (date: string, weekStartsOn: number) => { const a = startOfWeek(date, weekStartsOn); return Array.from({ length: 7 }, (_, i) => addDays(a, i)) }
/** The columns of a time grid. `count` narrows a week (a phone shows 3 days from `date`). */
export function viewDays(view: CalView, date: string, weekStartsOn: number, count = 7) {
  if (view === 'day') return [date as IsoDate]
  if (count < 7) return Array.from({ length: count }, (_, i) => addDays(date, i))
  return weekDates(date, weekStartsOn)
}
/** The dates a view needs, inclusive: what an app asks its query for. */
export function viewRange(view: CalView, date: string, weekStartsOn: number) {
  if (view === 'day' || view === 'timeline') return { start: date, end: date }
  if (view === 'year') return { start: `${date.slice(0, 4)}-01-01`, end: `${date.slice(0, 4)}-12-31` }
  if (view === 'month') { const a = startOfWeek(monthStart(date), weekStartsOn); return { start: a, end: addDays(a, 41) } }
  const a = startOfWeek(date, weekStartsOn)
  return { start: a, end: addDays(a, 6) }
}
export function stepDate(view: CalView, date: string, dir: number) {
  if (view === 'month') return addMonths(date, dir)
  if (view === 'year') return addMonths(date, 12 * dir)
  return addDays(date, view === 'day' || view === 'timeline' ? dir : 7 * dir)
}
/** Six weeks round a month. */
export function monthCells(date: string, weekStartsOn: number) {
  const a = startOfWeek(monthStart(date), weekStartsOn), first = monthStart(date), last = monthEnd(date)
  return Array.from({ length: 6 }, (_, r) => ({ key: addDays(a, r * 7), cells: Array.from({ length: 7 }, (_, c) => { const iso = addDays(a, r * 7 + c); return { iso, outside: iso < first || iso > last } }) }))
}

/** "Design crit, Monday 10:00 to 11:30, Studio, tentative". */
export function eventName(e: CalEvent, locale: string, hourCycle?: string) {
  const day = fmt(dateOf(e.start), { weekday: 'long' }, locale)
  const s = slotOf(e)
  return [
    e.title,
    e.allDay ? `${day}, all day` : `${day} ${clock(s.s, locale, hourCycle)} to ${clock(s.e, locale, hourCycle)}`,
    e.location,
    e.recurrence && 'repeats',
    e.tentative && 'tentative',
    e.declined && 'declined',
    e.locked && 'locked',
  ].filter(Boolean).join(', ')
}

// -- snapping, drags, keyboard moves ----------------------------------------------------------------------------------

export const snapTo = (m: number, step = 15) => Math.round(m / step) * step

export function dragMove(origin: Slot, dm: number, date: string, step = 15, resource?: string | undefined): Slot {
  const len = origin.e - origin.s
  const s = clamp(snapTo(origin.s + dm, step), 0, DAY - Math.min(len, DAY))
  return { date, s, e: s + len, resource: resource ?? origin.resource }
}
export function dragResize(origin: Slot, dm: number, step = 15): Slot {
  return { ...origin, e: clamp(snapTo(origin.e + dm, step), origin.s + step, DAY) }
}
/** A drag on empty slots, either way from where it began. */
export function dragCreate(date: string, anchor: number, current: number, step = 15): Slot {
  const a = snapTo(anchor, step), c = snapTo(current, step)
  const s = clamp(Math.min(a, c), 0, DAY - step)
  return { date, s, e: clamp(Math.max(a + (c >= a ? 0 : step), c), s + step, DAY) }
}

export type MoveKey = 'drop' | 'cancel' | Slot | null
/**
 * Keyboard move mode (07 §2.2): ↑↓ by `step`, ←→ by a day within `days`, Shift+↑↓ resizes, Enter drops, Escape cancels.
 * On a timeline (`resources`) ←→ move along the lane and ↑↓ between rows.
 */
export function moveKey(key: string, shift: boolean, slot: Slot, opts: { step?: number; days?: string[]; rtl?: boolean; resources?: string[] } = {}): MoveKey {
  const { step = 15, days, rtl, resources } = opts
  const len = slot.e - slot.s
  const by = (d: number): Slot => { const s = clamp(slot.s + d, 0, DAY - len); return { ...slot, s, e: s + len } }
  if (key === 'Enter') return 'drop'
  if (key === 'Escape') return 'cancel'
  const dir = key === 'ArrowRight' ? (rtl ? -1 : 1) : key === 'ArrowLeft' ? (rtl ? 1 : -1) : 0
  const down = key === 'ArrowDown' ? 1 : key === 'ArrowUp' ? -1 : 0
  if (resources) {
    if (dir) return by(dir * step)
    if (!down) return null
    const r = resources[resources.indexOf(slot.resource ?? '') + down]
    return r ? { ...slot, resource: r } : slot
  }
  if (down) return shift ? dragResize(slot, down * step, step) : by(down * step)
  if (!dir) return null
  const to = addDays(slot.date, dir)
  return !days || days.includes(to) ? { ...slot, date: to } : slot
}

/** Roving keys over events: ↑↓ through time, ←→ to the nearest event of the next day with one. */
export function eventKey(key: string, id: string, events: CalEvent[], rtl = false) {
  const order = [...events].sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0))
  const i = order.findIndex(e => e.id === id)
  if (i < 0) return null
  if (key === 'ArrowDown') return order[i + 1]?.id ?? null
  if (key === 'ArrowUp') return order[i - 1]?.id ?? null
  if (key === 'Home') return order[0]!.id
  if (key === 'End') return order[order.length - 1]!.id
  if (key !== 'ArrowLeft' && key !== 'ArrowRight') return null
  const forward = (key === 'ArrowRight') !== rtl
  const day = dateOf(order[i]!.start), m = minuteOf(order[i]!.start)
  const days = [...new Set(order.map(e => dateOf(e.start)))].filter(d => (forward ? d > day : d < day))
  const to = forward ? days[0] : days[days.length - 1]
  if (!to) return null
  return order.filter(e => dateOf(e.start) === to).sort((a, b) => Math.abs(minuteOf(a.start) - m) - Math.abs(minuteOf(b.start) - m))[0]!.id
}

/** ←→ along a lane, ↑↓ to the nearest booking in the next row (07 §2.5). */
export function laneKey(key: string, id: string, rows: { id: string; s: number }[][]) {
  const r = rows.findIndex(l => l.some(x => x.id === id))
  if (r < 0) return null
  const lane = rows[r]!, i = lane.findIndex(x => x.id === id)
  if (key === 'ArrowRight') return lane[i + 1]?.id ?? null
  if (key === 'ArrowLeft') return lane[i - 1]?.id ?? null
  if (key === 'Home') return lane[0]!.id
  if (key === 'End') return lane[lane.length - 1]!.id
  if (key !== 'ArrowDown' && key !== 'ArrowUp') return null
  const d = key === 'ArrowDown' ? 1 : -1
  for (let n = r + d; n >= 0 && n < rows.length; n += d) if (rows[n]!.length) return [...rows[n]!].sort((a, b) => Math.abs(a.s - lane[i]!.s) - Math.abs(b.s - lane[i]!.s))[0]!.id
  return null
}

export type DragPreview = Slot & { mode: 'move' | 'resize' | 'create'; id?: string | undefined; origin?: Slot | undefined }
export interface CalendarDragOptions {
  /** `x` for a timeline: lanes, with time running across and `from`..`to` minutes on it. */
  axis?: 'x' | 'y'
  from?: number
  to?: number
  step?: number
  readOnly?: boolean
  /** The event's slot; `null` for one that can't be dragged (locked). */
  slot(id: string): Slot | null
  onPreview(p: DragPreview | null): void
  onDrop(p: DragPreview): void
  onPress(id: string, el: HTMLElement): void
  onLongPress?(id: string, el: HTMLElement): void
  /** A double-click on an empty slot. */
  onSlot?(date: string, minute: number, resource?: string | undefined): void
}

const LONG_PRESS = 400
/**
 * Pointer gestures on a time grid (07 §2.2): past a 4px threshold an event moves, its bottom handle resizes, and empty
 * slots draw a draft, all snapped to `step` (Alt for 5) and cancelled by Escape. Nothing is captured until the
 * threshold, so a press stays a click on the event. A touch never drags: a long press lifts, a swipe scrolls.
 * `[data-part="col"]` carries `data-date`, a lane `data-resource`, and an event `data-id`.
 */
export function calendarDrag(el: HTMLElement, opts: CalendarDragOptions) {
  let o = opts
  const doc = el.ownerDocument
  type Drag = { mode: DragPreview['mode']; pointer: number; x0: number; y0: number; id?: string | undefined; origin?: Slot | undefined; date: string; anchor: number; resource?: string | undefined; moved: boolean; preview?: DragPreview }
  let drag: Drag | null = null
  let press: { timer: ReturnType<typeof setTimeout>; x: number; y: number } | null = null
  let swallow = false
  const horizontal = () => o.axis === 'x'
  const cells = () => [...el.querySelectorAll<HTMLElement>(horizontal() ? '[data-part="lane"]' : '[data-part="col"]')]
  const span = () => (o.to ?? DAY) - (o.from ?? 0)
  const scale = (cell: HTMLElement) => { const r = cell.getBoundingClientRect(); return (horizontal() ? r.width : r.height) / span() || 1 }
  const minuteAt = (cell: HTMLElement, e: PointerEvent) => {
    const r = cell.getBoundingClientRect()
    return (o.from ?? 0) + ((horizontal() ? e.clientX - r.left : e.clientY - r.top) / scale(cell))
  }
  const cellAt = (e: PointerEvent) => cells().find(c => { const r = c.getBoundingClientRect(); return horizontal() ? e.clientY >= r.top && e.clientY < r.bottom : e.clientX >= r.left && e.clientX < r.right })
  const cancelPress = () => { if (press) clearTimeout(press.timer); press = null }
  const stop = (commit: boolean) => {
    const d = drag
    drag = null
    doc.removeEventListener('keydown', onKey, true)
    if (!d) return
    if (d.moved) {
      swallow = true
      setTimeout(() => (swallow = false))
      if (el.hasPointerCapture?.(d.pointer)) el.releasePointerCapture(d.pointer)
      o.onPreview(null)
      if (commit && d.preview) o.onDrop(d.preview)
    }
  }
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape' && drag?.moved) { e.preventDefault(); e.stopPropagation(); stop(false) } }
  const onDown = (e: PointerEvent) => {
    if (e.button) return
    const target = e.target as Element
    const node = target.closest<HTMLElement>('[data-part="event"]')
    const cell = target.closest<HTMLElement>(horizontal() ? '[data-part="lane"]' : '[data-part="col"]')
    if (!cell) return
    if (e.pointerType === 'touch') {
      if (node && o.onLongPress) press = { x: e.clientX, y: e.clientY, timer: setTimeout(() => { press = null; swallow = true; setTimeout(() => (swallow = false), 600); o.onLongPress!(node.dataset.id!, node) }, LONG_PRESS) }
      return
    }
    if (o.readOnly) return
    const date = cell.dataset.date ?? ''
    const resource = cell.dataset.resource
    if (node) {
      const slot = o.slot(node.dataset.id!)
      if (!slot) return
      e.preventDefault()
      drag = { mode: target.closest('[data-part="resize"]') ? 'resize' : 'move', pointer: e.pointerId, x0: e.clientX, y0: e.clientY, id: node.dataset.id, origin: slot, date: slot.date, anchor: 0, resource, moved: false }
    } else {
      e.preventDefault()
      drag = { mode: 'create', pointer: e.pointerId, x0: e.clientX, y0: e.clientY, date, anchor: minuteAt(cell, e), resource, moved: false }
    }
    doc.addEventListener('keydown', onKey, true)
  }
  const onMove = (e: PointerEvent) => {
    if (press && Math.hypot(e.clientX - press.x, e.clientY - press.y) > 6) cancelPress()
    const d = drag
    if (!d) return
    if (!d.moved) {
      if (Math.hypot(e.clientX - d.x0, e.clientY - d.y0) < 4) return
      d.moved = true
      el.setPointerCapture?.(d.pointer)
    }
    const step = e.altKey ? 5 : (o.step ?? 15)
    const cell = cellAt(e)
    const first = cells()[0]
    const dm = (horizontal() ? e.clientX - d.x0 : e.clientY - d.y0) / (first ? scale(first) : 1)
    let slot: Slot
    if (d.mode === 'move') slot = dragMove(d.origin!, dm, (!horizontal() && cell?.dataset.date) || d.date, step, horizontal() ? cell?.dataset.resource ?? d.origin!.resource : undefined)
    else if (d.mode === 'resize') slot = dragResize(d.origin!, dm, step)
    else {
      const c = cells().find(x => (horizontal() ? x.dataset.resource === d.resource : x.dataset.date === d.date))
      slot = { ...dragCreate(d.date, d.anchor, c ? minuteAt(c, e) : d.anchor, step), resource: d.resource }
    }
    d.preview = { ...slot, mode: d.mode, id: d.id, origin: d.origin }
    o.onPreview(d.preview!)
  }
  const onUp = () => { cancelPress(); stop(true) }
  const onCancel = () => { cancelPress(); stop(false) }
  const onClick = (e: MouseEvent) => {
    if (swallow) { swallow = false; e.preventDefault(); e.stopPropagation(); return }
    const node = (e.target as Element).closest<HTMLElement>('[data-part="event"]')
    if (node) o.onPress(node.dataset.id!, node)
  }
  const onDouble = (e: MouseEvent) => {
    const t = e.target as Element
    if (o.readOnly || t.closest('[data-part="event"]')) return
    const cell = t.closest<HTMLElement>(horizontal() ? '[data-part="lane"]' : '[data-part="col"]')
    if (cell) o.onSlot?.(cell.dataset.date ?? '', snapTo(minuteAt(cell, e as PointerEvent), o.step ?? 15), cell.dataset.resource)
  }
  const onMenu = (e: Event) => { if (press) e.preventDefault() }
  const on = { pointerdown: onDown, pointermove: onMove, pointerup: onUp, pointercancel: onCancel, click: onClick, dblclick: onDouble, contextmenu: onMenu } as const
  for (const [k, f] of Object.entries(on)) el.addEventListener(k, f as EventListener)
  return {
    update(next: CalendarDragOptions) { o = next },
    destroy() {
      cancelPress()
      doc.removeEventListener('keydown', onKey, true)
      for (const [k, f] of Object.entries(on)) el.removeEventListener(k, f as EventListener)
    },
  }
}

/** Long press on `selector` inside `el`: `data-pressing` while held, `onPress` after 400ms, a move or lift cancels. */
export function longPress(el: HTMLElement, opts: { selector: string; onPress(row: HTMLElement): void }) {
  let o = opts
  let timer: ReturnType<typeof setTimeout> | undefined
  let row: HTMLElement | undefined
  let start = { x: 0, y: 0 }
  const clear = () => { clearTimeout(timer); timer = undefined; if (row) delete row.dataset.pressing; row = undefined }
  const down = (e: PointerEvent) => {
    const r = (e.target as Element).closest<HTMLElement>(o.selector)
    if (!r || e.button) return
    clear()
    row = r
    start = { x: e.clientX, y: e.clientY }
    r.dataset.pressing = ''
    timer = setTimeout(() => { const at = row!; clear(); el.ownerDocument.defaultView?.navigator.vibrate?.(8); o.onPress(at) }, LONG_PRESS)
  }
  const move = (e: PointerEvent) => { if (row && Math.hypot(e.clientX - start.x, e.clientY - start.y) > 8) clear() }
  const menu = (e: Event) => { if ((e.target as Element).closest(o.selector)) e.preventDefault() }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', clear)
  el.addEventListener('pointercancel', clear)
  el.addEventListener('contextmenu', menu)
  return {
    update(next: typeof opts) { o = next },
    destroy() {
      clear()
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', clear)
      el.removeEventListener('pointercancel', clear)
      el.removeEventListener('contextmenu', menu)
    },
  }
}

/** Horizontal swipe between three pages (07 §2.3): axis lock at 8px, a quarter width or a flick pages. */
export function swipePages(el: HTMLElement, opts: { track(): HTMLElement | null | undefined; onStep(dir: 1 | -1): void }) {
  let o = opts
  let st: { x: number; y: number; t: number; lock: 'x' | 'y' | null } | null = null
  const down = (e: PointerEvent) => { if (!e.button) st = { x: e.clientX, y: e.clientY, t: performance.now(), lock: null } }
  const move = (e: PointerEvent) => {
    if (!st) return
    const dx = e.clientX - st.x, dy = e.clientY - st.y
    if (!st.lock && Math.hypot(dx, dy) > 8) st.lock = Math.abs(dx) > Math.abs(dy) ? 'x' : 'y'
    if (st.lock !== 'x') return
    const t = o.track()
    if (t) { t.dataset.dragging = ''; t.style.setProperty('--_dx', `${dx}px`) }
    el.setPointerCapture?.(e.pointerId)
  }
  const up = (e: PointerEvent) => {
    if (!st) return
    const dx = e.clientX - st.x, flick = Math.abs(dx) / (performance.now() - st.t), was = st.lock
    st = null
    const t = o.track()
    if (t) delete t.dataset.dragging
    if (was !== 'x') return
    if (Math.abs(dx) > el.clientWidth * 0.25 || flick > 0.5) o.onStep(dx < 0 ? 1 : -1)
    else t?.style.setProperty('--_dx', '0px')
  }
  el.addEventListener('pointerdown', down)
  el.addEventListener('pointermove', move)
  el.addEventListener('pointerup', up)
  el.addEventListener('pointercancel', up)
  return {
    update(next: typeof opts) { o = next },
    destroy() {
      el.removeEventListener('pointerdown', down)
      el.removeEventListener('pointermove', move)
      el.removeEventListener('pointerup', up)
      el.removeEventListener('pointercancel', up)
    },
  }
}

/** Motion is off, by the OS or the dial. */
export const motionOff = (el: Element) => !!el.closest('[data-motion="reduce"]') || !!el.ownerDocument.defaultView?.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/** Run `track` to `dx` on its transition, then `land` with transitions off for a frame; straight to `land` if nothing moves. */
export function slide(track: HTMLElement, dx: string, land: () => void) {
  const win = track.ownerDocument.defaultView!
  if (motionOff(track) || !(parseFloat(win.getComputedStyle(track).transitionDuration) > 0)) return land()
  let done = false
  const finish = () => {
    if (done) return
    done = true
    track.removeEventListener('transitionend', finish)
    track.dataset.dragging = ''
    land()
    win.requestAnimationFrame(() => delete track.dataset.dragging)
  }
  track.addEventListener('transitionend', finish, { once: true })
  setTimeout(finish, 500)
  track.style.setProperty('--_dx', dx)
}

// -- agenda -----------------------------------------------------------------------------------------------------------

export type AgendaItem =
  | { kind: 'allday'; key: string; event: CalEvent }
  | { kind: 'event'; key: string; event: CalEvent; s: number; e: number }
  | { kind: 'now'; key: 'now'; at: number }
  | { kind: 'free'; key: string; minutes: number }

/** One day's rows: all-day, then events with the now marker and "1 h free" gaps of at least `gap` minutes between. */
export function agendaItems(events: CalEvent[], day: string, now?: string | null, gap = 60): AgendaItem[] {
  const out: AgendaItem[] = events.filter(e => e.allDay && dateOf(e.start) <= day && dateOf(e.end) >= day).map(event => ({ kind: 'allday', key: event.id, event }))
  const mark = now && dateOf(now) === day ? minuteOf(now) : null
  let placed = mark === null, last: number | null = null
  for (const { event, s, e } of daySegments(events, day)) {
    if (!placed && s >= mark!) { out.push({ kind: 'now', key: 'now', at: mark! }); placed = true }
    if (last !== null && s - last >= gap) out.push({ kind: 'free', key: `free-${s}`, minutes: s - last })
    out.push({ kind: 'event', key: event.id, event, s, e })
    last = Math.max(last ?? 0, e)
  }
  if (!placed) out.push({ kind: 'now', key: 'now', at: mark! })
  return out
}

/** The sources with something on a day, at most three (the strip's dots). */
export const dayDots = (events: CalEvent[], day: string) => [...new Set(eventsOn(events, day).map(e => e.cal ?? 1))].slice(0, 3)

/** MoveSheet's start times: disabled when another event is there. */
export function moveSlots(events: CalEvent[], e: CalEvent, date: string, len: number, from = 480, to = 1080, step = 30) {
  const out: { s: number; busy: boolean }[] = []
  for (let s = from; s < to; s += step) out.push({ s, busy: conflicts(events, e, { date, s, e: s + len }).length > 0 })
  return out
}

// -- year -------------------------------------------------------------------------------------------------------------

/** Dots for a day: 1 for 1–2 events, 2 for 3–4, 3 for 5 or more. */
export const yearLevel = (n: number) => (n === 0 ? 0 : n <= 2 ? 1 : n <= 4 ? 2 : 3)
/** `{ [isoDay]: n }` from events; an app with a year of data sends this instead (07 §2.7). */
export function countByDay(events: CalEvent[]) {
  const out: Record<string, number> = {}
  for (const e of events) {
    const last = e.allDay ? dateOf(e.end) : dateOf(at(dateOf(e.end), minuteOf(e.end) - 1))
    for (let d: string = dateOf(e.start); d <= last; d = addDays(d, 1)) out[d] = (out[d] ?? 0) + 1
  }
  return out
}
export function monthSummary(counts: Record<string, number>, month: string) {
  let total = 0, busiest: string | null = null, most = 0
  for (let d: string = monthStart(month); d <= monthEnd(month); d = addDays(d, 1)) {
    const n = counts[d] ?? 0
    total += n
    if (n > most) { most = n; busiest = d }
  }
  return { total, busiest, most }
}
export const yearTotal = (counts: Record<string, number>, year: number) => Object.entries(counts).reduce((t, [d, n]) => (d.startsWith(`${year}-`) ? t + n : t), 0)
/** The twelve first-of-months of a year. */
export const yearMonths = (year: number) => Array.from({ length: 12 }, (_, m) => toIso(year, m + 1, 1))
/** gridKey for the year's one stop, plus `month` for M and `today` for T. */
export function yearKey(key: string, shift: boolean, cursor: string, weekStartsOn: number, rtl: boolean) {
  if (key === 'm' || key === 'M') return 'month' as const
  if (key === 't' || key === 'T') return 'today' as const
  return gridKey(key, shift, cursor, weekStartsOn, rtl)
}

// -- planner ----------------------------------------------------------------------------------------------------------

export interface Attendee { id: string; name: string; zone?: string; organizer?: boolean; busy?: Range[]; hours?: Range }

export const isFree = (busy: Range[][], s: number, len: number) => busy.every(list => !list.some(([a, b]) => a < s + len && b > s))
/** Time everyone has, merged, from `from` to `to`. */
export function sharedFree(busy: Range[][], from: number, to: number, step = 15) {
  const out: Range[] = []
  for (let m = from; m < to; m += step) if (isFree(busy, m, step)) out.push([m, m + step])
  return mergeRanges(out)
}
/** A wall minute in the organizer's zone, read in another. */
export function zoneMinute(date: string, m: number, from: string | undefined, to: string | undefined) {
  if (!from || !to || from === to) return m
  const t = toZone(at(date, m), from, to)
  return minuteOf(t) + daysBetween(date, dateOf(t)) * DAY
}
/** How many attendees have `s`..`s + len` inside their working hours, each in their own zone. */
export function withinHours(people: Attendee[], date: string, s: number, len: number, zone?: string) {
  return people.filter(p => {
    const [a, b] = p.hours ?? [540, 1020]
    const m = zoneMinute(date, s, zone, p.zone)
    return m >= a && m + len <= b
  }).length
}
/**
 * Suggested times: free for everyone, at least `gap` apart, the ones inside the most people's working hours first, then
 * earliest; `limit` of them, in time order.
 */
export function suggestSlots(people: Attendee[], date: string, opts: { len: number; from?: number; to?: number; step?: number; gap?: number; limit?: number; zone?: string }) {
  const { len, from = 480, to = 1080, step = 15, gap = 60, limit = 3, zone } = opts
  const busy = people.map(p => p.busy ?? [])
  const list: { s: number; fit: number }[] = []
  for (let s = from; s + len <= to; s += step) {
    if (!isFree(busy, s, len) || (list.length && s - list[list.length - 1]!.s < gap)) continue
    list.push({ s, fit: withinHours(people, date, s, len, zone) })
  }
  return list.sort((a, b) => b.fit - a.fit || a.s - b.s).slice(0, limit).map(x => x.s).sort((a, b) => a - b)
}

// -- availability -----------------------------------------------------------------------------------------------------

export interface WeekDay { day: number; on: boolean; ranges: Range[] }
export interface Override { id: string; date: string; ranges: Range[] | null; note?: string | undefined }

/** One message per range, '' when it's fine (07 §6.4). */
export const rangeIssues = (ranges: Range[]) => ranges.map((r, i) => (r[1] <= r[0] ? 'Ends before it starts' : ranges.some((q, j) => j !== i && r[0] < q[1] && q[0] < r[1]) ? 'Overlaps another range' : ''))
export const weekValid = (week: WeekDay[]) => week.every(d => !d.on || rangeIssues(d.ranges).every(x => !x))
/** The next range after a day's last one: an hour on, two long, inside the select's last time. */
export function nextRange(ranges: Range[], last = 1320): Range {
  const s = Math.min(last - 30, (ranges[ranges.length - 1]?.[1] ?? 480) + 60)
  return [s, Math.min(last, s + 120)]
}
export const timeOptions = (from = 360, to = 1320, step = 30) => { const out: number[] = []; for (let m = from; m <= to; m += step) out.push(m); return out }
export const hhmm = (m: number) => `${Math.floor(m / 60)}:${pad(m % 60)}`
export const asTime = (m: number) => fromMinutes(m) as IsoTime
