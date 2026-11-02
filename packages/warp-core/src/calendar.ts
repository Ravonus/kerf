// The calendar grid (04 §1.4, APG Date Picker Dialog with a Grid), as plain data: the weeks of a month, what one day
// shows and is called, and which day a key moves to. A binding renders it and owns view, cursor and hover.
import { addDays, addMonths, daysIn, dow, fmt, messages, pad, weekOf, weekendDays, ymd, type DateRange, type IsoDate, type IsoWeek } from './temporal'

export type CalendarValue = IsoDate | IsoDate[] | DateRange | IsoWeek | null
export type CalendarMode = 'single' | 'multiple' | 'range' | 'week'

export interface CalendarContext {
  mode: CalendarMode
  value: CalendarValue
  /** A second range, painted in info-soft (date range comparison). */
  compare?: DateRange | null
  today: string
  locale: string
  hover?: string | null
  min?: string
  max?: string
  isDateUnavailable?: (d: IsoDate) => boolean
}

/** The month's weeks: seven entries each, blank days (outside the month) null. Always the rows the month needs. */
export function monthWeeks(month: string, weekStartsOn: number) {
  const [y, m] = ymd(month)
  const offset = (dow(`${month.slice(0, 8)}01`) - weekStartsOn + 7) % 7
  const total = daysIn(y, m)
  const weeks: (IsoDate | null)[][] = []
  for (let r = 0; r * 7 - offset < total; r++) {
    const row: (IsoDate | null)[] = []
    for (let c = 0; c < 7; c++) {
      const day = r * 7 + c - offset + 1
      row.push(day < 1 || day > total ? null : `${month.slice(0, 8)}${pad(day)}` as IsoDate)
    }
    weeks.push(row)
  }
  return weeks
}

/** Weekday headers from the week start: `[abbr, shown]`. */
export const weekdays = (weekStartsOn: number, locale: string) => Array.from({ length: 7 }, (_, c) => {
  const ref = addDays('2024-01-07', (weekStartsOn + c) % 7) // a Sunday
  return [fmt(ref, { weekday: 'long' }, locale), fmt(ref, { weekday: locale.startsWith('ja') ? 'narrow' : 'short' }, locale).replace(/\.$/, ''), (weekStartsOn + c) % 7] as const
})

export const isOutOfBounds = (iso: string, c: Pick<CalendarContext, 'min' | 'max'>) => !!((c.min && iso < c.min) || (c.max && iso > c.max))
export const isUnavailable = (iso: string, c: CalendarContext) => isOutOfBounds(iso, c) || !!c.isDateUnavailable?.(iso as IsoDate)

const ordered = (a: string, b: string) => (a <= b ? [a, b] : [b, a])

export interface DayState {
  selected: boolean
  /** The gridcell's aria-selected: the ends and the band of a range too. */
  cellSelected: boolean
  range?: 'start' | 'mid' | 'end' | 'solo' | undefined
  preview: boolean
  compare: boolean
  today: boolean
  unavailable: boolean
  booked: boolean
  /** "Wednesday, October 14, 2026, today, start of range". */
  name: string
}

export function dayState(iso: IsoDate, c: CalendarContext): DayState {
  const t = messages(c.locale)
  const words: string[] = []
  const today = iso === c.today
  if (today) words.push(t.today)
  const unavailable = isUnavailable(iso, c)
  if (unavailable) words.push(t.unavailable)
  let selected = false, previewing = false
  let range: DayState['range']
  if (c.mode === 'single') selected = c.value === iso
  else if (c.mode === 'multiple') selected = (c.value as IsoDate[] | null)?.includes(iso) ?? false
  else if (c.mode === 'week') selected = c.value === weekOf(iso)
  else {
    const v = c.value as DateRange
    if (v?.start) {
      let e = v.end
      if (!e && c.hover) { e = c.hover as IsoDate; previewing = true }
      const [lo, hi] = ordered(v.start, e ?? v.start) as [string, string]
      if (iso === lo || iso === hi) selected = !previewing || iso === v.start
      if (lo !== hi && iso >= lo && iso <= hi) {
        range = iso === lo ? 'start' : iso === hi ? 'end' : 'mid'
        if (!previewing) words.push(range === 'mid' ? t.mid : t[range])
      } else if (lo === hi && iso === lo) range = 'solo'
    }
  }
  return {
    selected,
    cellSelected: selected || (range === 'mid' && !previewing),
    range,
    preview: previewing && !!range && range !== 'solo',
    compare: !!(c.compare?.start && c.compare.end && iso >= c.compare.start && iso <= c.compare.end),
    today,
    unavailable,
    booked: !!c.isDateUnavailable?.(iso),
    name: [fmt(iso, { dateStyle: 'full' }, c.locale), ...words].join(', '),
  }
}

/** The day a key moves the cursor to; "pick" for Enter/Space; null when the key isn't the grid's. */
export function gridKey(key: string, shift: boolean, cursor: string, weekStartsOn: number, rtl: boolean): string | 'pick' | null {
  switch (key) {
    case 'ArrowLeft': return addDays(cursor, rtl ? 1 : -1)
    case 'ArrowRight': return addDays(cursor, rtl ? -1 : 1)
    case 'ArrowUp': return addDays(cursor, -7)
    case 'ArrowDown': return addDays(cursor, 7)
    case 'Home': return addDays(cursor, -((dow(cursor) - weekStartsOn + 7) % 7))
    case 'End': return addDays(cursor, 6 - ((dow(cursor) - weekStartsOn + 7) % 7))
    case 'PageUp': return addMonths(cursor, shift ? -12 : -1)
    case 'PageDown': return addMonths(cursor, shift ? 12 : 1)
    case 'Enter': case ' ': return 'pick'
    default: return null
  }
}

/** Range picking: first press starts, second ends (swapped if earlier), a third starts over. */
export function pickRange(v: DateRange, iso: IsoDate): DateRange {
  if (!v.start || v.end) return { start: iso, end: null }
  return iso < v.start ? { start: iso, end: v.start } : { start: v.start, end: iso }
}

export const isWeekend = (weekday: number, locale: string) => weekendDays(locale).includes(weekday)
