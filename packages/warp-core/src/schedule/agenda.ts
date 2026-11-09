import type { CalEvent } from './dates'
import { dateOf, minuteOf, at } from './dates'
import { daySegments, eventsOn, conflicts } from './events'
import { addDays, monthStart, monthEnd, toIso } from '../temporal'
import { gridKey } from '../calendar'

// -- agenda -----------------------------------------------------------------------------------------------------------

/** One row of the agenda view. */
export type AgendaItem =
  | { kind: 'allday'; key: string; event: CalEvent }
  | { kind: 'event'; key: string; event: CalEvent; s: number; e: number }
  | { kind: 'now'; key: 'now'; at: number }
  | { kind: 'free'; key: string; minutes: number }

/** One day's rows: all-day, then events with the now marker and "1 h free" gaps of at least `gap` minutes between. */
export function agendaItems(
  events: CalEvent[],
  day: string,
  now?: string | null,
  gap = 60,
): AgendaItem[] {
  const out: AgendaItem[] = events
    .filter((e) => e.allDay && dateOf(e.start) <= day && dateOf(e.end) >= day)
    .map((event) => ({ kind: 'allday', key: event.id, event }))
  const mark = now && dateOf(now) === day ? minuteOf(now) : null
  let placed = mark === null,
    last: number | null = null
  for (const { event, s, e } of daySegments(events, day)) {
    if (!placed && s >= mark!) {
      out.push({ kind: 'now', key: 'now', at: mark! })
      placed = true
    }
    if (last !== null && s - last >= gap)
      out.push({ kind: 'free', key: `free-${s}`, minutes: s - last })
    out.push({ kind: 'event', key: event.id, event, s, e })
    last = Math.max(last ?? 0, e)
  }
  if (!placed) out.push({ kind: 'now', key: 'now', at: mark! })
  return out
}

/** The sources with something on a day, at most three (the strip's dots). */
export const dayDots = (events: CalEvent[], day: string) =>
  [...new Set(eventsOn(events, day).map((e) => e.cal ?? 1))].slice(0, 3)

/** MoveSheet's start times: disabled when another event is there. */
// oxlint-disable-next-line max-params -- public schedule API; changing it is a breaking change
export function moveSlots(
  events: CalEvent[],
  e: CalEvent,
  date: string,
  len: number,
  from = 480,
  to = 1080,
  step = 30,
) {
  const out: { s: number; busy: boolean }[] = []
  for (let s = from; s < to; s += step)
    out.push({ s, busy: conflicts(events, e, { date, s, e: s + len }).length > 0 })
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

/** A month's total, as a sentence. */
export function monthSummary(counts: Record<string, number>, month: string) {
  let total = 0,
    busiest: string | null = null,
    most = 0
  for (let d: string = monthStart(month); d <= monthEnd(month); d = addDays(d, 1)) {
    const n = counts[d] ?? 0
    total += n
    if (n > most) {
      most = n
      busiest = d
    }
  }
  return { total, busiest, most }
}

/** All the events counted in `year`. */
export const yearTotal = (counts: Record<string, number>, year: number) =>
  Object.entries(counts).reduce((t, [d, n]) => (d.startsWith(`${year}-`) ? t + n : t), 0)

/** The twelve first-of-months of a year. */
export const yearMonths = (year: number) =>
  Array.from({ length: 12 }, (_, m) => toIso(year, m + 1, 1))

/** gridKey for the year's one stop, plus `month` for M and `today` for T. */
export function yearKey(
  key: string,
  shift: boolean,
  cursor: string,
  weekStartsOn: number,
  rtl: boolean,
) {
  if (key === 'm' || key === 'M') return 'month' as const
  if (key === 't' || key === 'T') return 'today' as const
  return gridKey(key, shift, cursor, weekStartsOn, rtl)
}
