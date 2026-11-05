import { addDays, dow, monthStart, addMonths, monthEnd, fmt } from '../temporal'
import type { CalView, CalEvent } from './dates'
import type { IsoDate } from '../temporal'
import { dateOf, slotOf, clock } from './dates'

// -- views ------------------------------------------------------------------------------------------------------------

/** The first day of `date`'s week. */
export const startOfWeek = (date: string, weekStartsOn: number) =>
  addDays(date, -((dow(date) - weekStartsOn + 7) % 7))

/** The seven days of `date`'s week. */
export const weekDates = (date: string, weekStartsOn: number) => {
  const a = startOfWeek(date, weekStartsOn)
  return Array.from({ length: 7 }, (_, i) => addDays(a, i))
}

/** The columns of a time grid. `count` narrows a week (a phone shows 3 days from `date`). */
export function viewDays(view: CalView, date: string, weekStartsOn: number, count = 7) {
  if (view === 'day') return [date as IsoDate]
  if (count < 7) return Array.from({ length: count }, (_, i) => addDays(date, i))
  return weekDates(date, weekStartsOn)
}

/** The dates a view needs, inclusive: what an app asks its query for. */
export function viewRange(view: CalView, date: string, weekStartsOn: number) {
  if (view === 'day' || view === 'timeline') return { start: date, end: date }
  if (view === 'year')
    return { start: `${date.slice(0, 4)}-01-01`, end: `${date.slice(0, 4)}-12-31` }
  if (view === 'month') {
    const a = startOfWeek(monthStart(date), weekStartsOn)
    return { start: a, end: addDays(a, 41) }
  }
  const a = startOfWeek(date, weekStartsOn)
  return { start: a, end: addDays(a, 6) }
}

/** The date one step on in `view`, `dir` being 1 or -1. */
export function stepDate(view: CalView, date: string, dir: number) {
  if (view === 'month') return addMonths(date, dir)
  if (view === 'year') return addMonths(date, 12 * dir)
  return addDays(date, view === 'day' || view === 'timeline' ? dir : 7 * dir)
}

/** Six weeks round a month. */
export function monthCells(date: string, weekStartsOn: number) {
  const a = startOfWeek(monthStart(date), weekStartsOn),
    first = monthStart(date),
    last = monthEnd(date)
  return Array.from({ length: 6 }, (_, r) => ({
    key: addDays(a, r * 7),
    cells: Array.from({ length: 7 }, (__, c) => {
      const iso = addDays(a, r * 7 + c)
      return { iso, outside: iso < first || iso > last }
    }),
  }))
}

/** "Design crit, Monday 10:00 to 11:30, Studio, tentative". */
export function eventName(e: CalEvent, locale: string, hourCycle?: string) {
  const day = fmt(dateOf(e.start), { weekday: 'long' }, locale)
  const s = slotOf(e)
  return [
    e.title,
    e.allDay
      ? `${day}, all day`
      : `${day} ${clock(s.s, locale, hourCycle)} to ${clock(s.e, locale, hourCycle)}`,
    e.location,
    e.recurrence && 'repeats',
    e.tentative && 'tentative',
    e.declined && 'declined',
    e.locked && 'locked',
  ]
    .filter(Boolean)
    .join(', ')
}
