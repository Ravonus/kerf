import type { IsoDate } from '../temporal'
import { minutes, addDays, fromMinutes, daysBetween, fmtTime, offsetAt } from '../temporal'

/** The calendar's views. */
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
  locked?: boolean | undefined
  declined?: boolean
  /** An RRULE. */
  recurrence?: string | null
  /** The zone `start` and `end` are written in, when it isn't the calendar's. */
  tz?: string | undefined
  location?: string | undefined
  attendees?: string[]
  video?: string | boolean
  /** Timeline row. */
  resource?: string | undefined
}

/** A span of time on a day, in minutes from midnight. */
export type Slot = { date: string; s: number; e: number; resource?: string | undefined }

/** An event's piece on one day. */
export type DaySegment = {
  event: CalEvent
  id: string
  s: number
  e: number
  head: boolean
  tail: boolean
}

/** An event's place among the ones it overlaps. */
export type Lane = { col: number; cols: number; span: number }

/** A pair of minutes, start then end. */
export type Range = [number, number]

/** Minutes in a day. */
export const DAY = 1440

/** The date of an ISO date-time. */
export const dateOf = (iso: string) => iso.slice(0, 10) as IsoDate

/** The minute of the day of an ISO date-time; 0 for a bare date. */
export const minuteOf = (iso: string) => (iso.length > 10 ? minutes(iso.slice(11, 16)) : 0)

/** A wall date-time from a date and minutes, which may run past either end of the day. */
export const at = (date: string, m: number) => {
  const d = Math.floor(m / DAY)
  return `${addDays(date, d)}T${fromMinutes(m - d * DAY)}`
}

/** Minutes from `a` to `b`. */
export const spanMinutes = (a: string, b: string) =>
  daysBetween(dateOf(a), dateOf(b)) * DAY + minuteOf(b) - minuteOf(a)

/** An event as a slot. */
export const slotOf = (e: CalEvent): Slot => ({
  date: dateOf(e.start),
  s: minuteOf(e.start),
  e: minuteOf(e.start) + spanMinutes(e.start, e.end),
  resource: e.resource,
})

/** A slot's start and end as date-times. */
export const slotTimes = (s: Slot) => ({ start: at(s.date, s.s), end: at(s.date, s.e) })

/** Minutes as "1 h 30 m", or "45 min". */
export const longDuration = (m: number) =>
  m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} m` : ''}` : `${m} min`

/** 24-hour by default, as in the specimen; `hourCycle` follows the locale's when `auto`. */
export const clock = (m: number, locale: string, hourCycle = 'h23') =>
  fmtTime(fromMinutes(((m % DAY) + DAY) % DAY), locale, hourCycle)

/** Two minutes of the day as a clock range. */
export const clockRange = (a: number, b: number, locale: string, hourCycle?: string) =>
  `${clock(a, locale, hourCycle)}–${clock(b, locale, hourCycle)}`

// -- zones ------------------------------------------------------------------------------------------------------------

const instant = (iso: string, zone: string) => {
  const wall = Date.parse(`${iso.slice(0, 16)}:00Z`)
  return wall - offsetAt(zone, wall - offsetAt(zone, wall) * 6e4) * 6e4
}

const stamp = (ms: number) => new Date(ms).toISOString().slice(0, 16)

/** A wall time in one zone, as a wall time in another. */
export const toZone = (iso: string, from: string, to: string) => {
  if (from === to) return iso.slice(0, 16)
  const t = instant(iso, from)
  return stamp(t + offsetAt(to, t) * 6e4)
}

/** The event as the calendar's zone shows it. */
export const shownIn = (e: CalEvent, zone?: string): CalEvent =>
  e.allDay || !zone || !e.tz || e.tz === zone
    ? e
    : { ...e, start: toZone(e.start, e.tz, zone), end: toZone(e.end, e.tz, zone) }

/** Minutes the clocks change by inside the event, 0 when they don't. */
export function dstShift(e: CalEvent, zone?: string) {
  const z = e.tz ?? zone
  if (e.allDay || !z) return 0
  return offsetAt(z, instant(e.end, z)) - offsetAt(z, instant(e.start, z))
}

/** The wall time now in `zone` (the browser's own without one). Never call it during render. */
export function nowIn(zone?: string, when = Date.now()) {
  const t = new Intl.DateTimeFormat('en-CA', {
    timeZone: zone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(new Date(when))
  const of = (k: string) => t.find((p) => p.type === k)!.value
  return `${of('year')}-${of('month')}-${of('day')}T${of('hour')}:${of('minute')}`
}
