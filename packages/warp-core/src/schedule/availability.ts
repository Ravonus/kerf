import type { Range } from './dates'
import { mergeRanges } from './events'
import { toZone, at, minuteOf, dateOf, DAY } from './dates'
import { daysBetween, pad, fromMinutes } from '../temporal'

// -- planner ----------------------------------------------------------------------------------------------------------

/** Someone a meeting is being found for. */
export interface Attendee {
  id: string
  name: string
  zone?: string | undefined
  organizer?: boolean
  busy?: Range[] | undefined
  hours?: Range
}

/** Whether everyone is free from `s` for `len` minutes. */
export const isFree = (busy: Range[][], s: number, len: number) =>
  busy.every((list) => !list.some(([a, b]) => a < s + len && b > s))

/** Time everyone has, merged, from `from` to `to`. */
export function sharedFree(busy: Range[][], from: number, to: number, step = 15) {
  const out: Range[] = []
  for (let m = from; m < to; m += step) if (isFree(busy, m, step)) out.push([m, m + step])
  return mergeRanges(out)
}

/** A wall minute in the organizer's zone, read in another. */
export function zoneMinute(
  date: string,
  m: number,
  from: string | undefined,
  to: string | undefined,
) {
  if (!from || !to || from === to) return m
  const t = toZone(at(date, m), from, to)
  return minuteOf(t) + daysBetween(date, dateOf(t)) * DAY
}

/** How many attendees have `s`..`s + len` inside their working hours, each in their own zone. */
export function withinHours(
  people: Attendee[],
  date: string,
  s: number,
  len: number,
  zone?: string,
) {
  return people.filter((p) => {
    const [a, b] = p.hours ?? [540, 1020]
    const m = zoneMinute(date, s, zone, p.zone)
    return m >= a && m + len <= b
  }).length
}

/**
 * Suggested times: free for everyone, at least `gap` apart, the ones inside the most people's working hours first, then
 * earliest; `limit` of them, in time order.
 */
export function suggestSlots(
  people: Attendee[],
  date: string,
  opts: {
    len: number
    from?: number | undefined
    to?: number | undefined
    step?: number
    gap?: number | undefined
    limit?: number | undefined
    zone?: string | undefined
  },
) {
  const { len, from = 480, to = 1080, step = 15, gap = 60, limit = 3, zone } = opts
  const busy = people.map((p) => p.busy ?? [])
  const list: { s: number; fit: number }[] = []
  for (let s = from; s + len <= to; s += step) {
    if (!isFree(busy, s, len) || (list.length && s - list[list.length - 1]!.s < gap)) continue
    list.push({ s, fit: withinHours(people, date, s, len, zone) })
  }
  return list
    .sort((a, b) => b.fit - a.fit || a.s - b.s)
    .slice(0, limit)
    .map((x) => x.s)
    .sort((a, b) => a - b)
}

// -- availability -----------------------------------------------------------------------------------------------------

/** One weekday's working hours. */
export interface WeekDay {
  day: number
  on: boolean
  ranges: Range[]
}

/** A date whose hours differ from the week's; null ranges means closed. */
export interface Override {
  id: string
  date: string
  ranges: Range[] | null
  note?: string | undefined
}

/** One message per range, '' when it's fine (07 §6.4). */
export const rangeIssues = (ranges: Range[]) =>
  ranges.map((r, i) =>
    r[1] <= r[0]
      ? 'Ends before it starts'
      : ranges.some((q, j) => j !== i && r[0] < q[1] && q[0] < r[1])
        ? 'Overlaps another range'
        : '',
  )

/** Whether every day that's on has valid ranges. */
export const weekValid = (week: WeekDay[]) =>
  week.every((d) => !d.on || rangeIssues(d.ranges).every((x) => !x))

/** The next range after a day's last one: an hour on, two long, inside the select's last time. */
export function nextRange(ranges: Range[], last = 1320): Range {
  const s = Math.min(last - 30, (ranges[ranges.length - 1]?.[1] ?? 480) + 60)
  return [s, Math.min(last, s + 120)]
}

/** The minutes a time picker offers. */
export const timeOptions = (from = 360, to = 1320, step = 30) => {
  const out: number[] = []
  for (let m = from; m <= to; m += step) out.push(m)
  return out
}

/** Minutes as h:mm. */
export const hhmm = (m: number) => `${Math.floor(m / 60)}:${pad(m % 60)}`

/** Minutes from midnight as an ISO time. */
export const asTime = (m: number) => fromMinutes(m)
