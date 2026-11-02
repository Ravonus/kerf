// RRULE (RFC 5545) for RecurrenceField (04 §2): the supported subset as data, its occurrences, and its plain-language
// sentence. Anything else in a rule lands in `unknown`, and a binding then shows the raw text rather than dropping it.
import { addDays, daysIn, dow, fmt, toIso, weekStart, ymd, type IsoDate } from './temporal'

export type Frequency = 'DAILY' | 'WEEKLY' | 'MONTHLY' | 'YEARLY'
export const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'] as const
export interface Rule {
  FREQ: Frequency
  INTERVAL: number
  /** `TU`, or with an ordinal `2WE`, `-1FR`. */
  BYDAY: string[]
  BYMONTHDAY: number | null
  BYMONTH: number | null
  COUNT: number | null
  /** An ISO date. */
  UNTIL: IsoDate | null
  /** Parts this field can't edit, as written. */
  unknown: string[]
}

export const emptyRule = (): Rule => ({ FREQ: 'WEEKLY', INTERVAL: 1, BYDAY: [], BYMONTHDAY: null, BYMONTH: null, COUNT: null, UNTIL: null, unknown: [] })

export function parseRule(text: string | null | undefined): Rule {
  const r = emptyRule()
  for (const part of (text ?? '').replace(/^RRULE:/i, '').split(';').filter(Boolean)) {
    const [k, v = ''] = part.split('=')
    if (k === 'FREQ' && /^(DAILY|WEEKLY|MONTHLY|YEARLY)$/.test(v)) r.FREQ = v as Frequency
    else if (k === 'INTERVAL' && +v >= 1) r.INTERVAL = +v
    else if (k === 'BYDAY' && /^(-?\d?(SU|MO|TU|WE|TH|FR|SA))(,-?\d?(SU|MO|TU|WE|TH|FR|SA))*$/.test(v)) r.BYDAY = v.split(',')
    else if (k === 'BYMONTHDAY' && /^-?\d+$/.test(v)) r.BYMONTHDAY = +v
    else if (k === 'BYMONTH' && /^\d+$/.test(v)) r.BYMONTH = +v
    else if (k === 'COUNT' && +v >= 1) r.COUNT = +v
    else if (k === 'UNTIL' && /^\d{8}/.test(v)) r.UNTIL = toIso(+v.slice(0, 4), +v.slice(4, 6), +v.slice(6, 8))
    else r.unknown.push(part)
  }
  return r
}

export function stringifyRule(r: Rule) {
  return [
    `FREQ=${r.FREQ}`,
    r.INTERVAL > 1 && `INTERVAL=${r.INTERVAL}`,
    r.BYDAY.length && `BYDAY=${r.BYDAY.join(',')}`,
    r.BYMONTHDAY !== null && `BYMONTHDAY=${r.BYMONTHDAY}`,
    r.BYMONTH !== null && `BYMONTH=${r.BYMONTH}`,
    r.COUNT && `COUNT=${r.COUNT}`,
    r.UNTIL && `UNTIL=${r.UNTIL.replace(/-/g, '')}T235959Z`,
    ...r.unknown,
  ].filter(Boolean).join(';')
}

const weekNo = (iso: string) => Math.floor((Date.parse(iso) / 864e5 + 3) / 7) // weeks since a Monday
const weekday = (iso: string) => DAYS[dow(iso)]!
/** Which of its weekday in the month a date is: 2 for the second Wednesday; `last` when no later one fits. */
export const weekdayOrdinal = (iso: string) => {
  const [y, m, d] = ymd(iso)
  return { nth: Math.ceil(d / 7), last: d + 7 > daysIn(y, m) }
}

function matchesDay(iso: string, r: Rule, dtstart: string) {
  const [y, m, d] = ymd(iso), [, , sd] = ymd(dtstart)
  const total = daysIn(y, m)
  const dayHit = () => {
    if (r.BYMONTHDAY !== null) return r.BYMONTHDAY < 0 ? d === total + 1 + r.BYMONTHDAY : d === r.BYMONTHDAY
    if (r.BYDAY.length) return r.BYDAY.some(b => {
      const n = parseInt(b)
      if (b.slice(-2) !== weekday(iso)) return false
      if (Number.isNaN(n)) return true
      return n > 0 ? Math.ceil(d / 7) === n : d + 7 * -n > total && d + 7 * (-n - 1) <= total
    })
    return d === sd
  }
  if (r.BYMONTH && m !== r.BYMONTH) return false
  return dayHit()
}

/** The next `n` occurrences from `dtstart`, as ISO dates. */
export function occurrences(r: Rule, dtstart: string, n: number): IsoDate[] {
  const out: IsoDate[] = []
  const [sy, sm] = ymd(dtstart)
  let done = 0
  for (let iso = dtstart, guard = 0; out.length < n && guard < 12000; iso = addDays(iso, 1), guard++) {
    if (r.UNTIL && iso > r.UNTIL) break
    const [y, m] = ymd(iso)
    let hit: boolean
    if (r.FREQ === 'DAILY') hit = guard % r.INTERVAL === 0 && (!r.BYDAY.length || r.BYDAY.includes(weekday(iso)))
    else if (r.FREQ === 'WEEKLY') hit = (r.BYDAY.length ? r.BYDAY.includes(weekday(iso)) : weekday(iso) === weekday(dtstart)) && (weekNo(iso) - weekNo(dtstart)) % r.INTERVAL === 0
    else if (r.FREQ === 'MONTHLY') hit = matchesDay(iso, r, dtstart) && ((y - sy) * 12 + m - sm) % r.INTERVAL === 0
    else hit = matchesDay(iso, r.BYMONTH ? r : { ...r, BYMONTH: sm }, dtstart) && (y - sy) % r.INTERVAL === 0
    if (!hit) continue
    out.push(iso as IsoDate)
    if (r.COUNT && ++done >= r.COUNT) break
  }
  return out
}

const dayName = (code: string, locale: string, style: 'long' | 'short' = 'long') => fmt(addDays('2024-01-07', DAYS.indexOf(code as (typeof DAYS)[number])), { weekday: style }, locale)
const NTH = ['', 'first', 'second', 'third', 'fourth', 'fifth']

/** The weekday codes in the locale's week order. */
export const weekOrder = (locale: string) => { const s = weekStart(locale); return Array.from({ length: 7 }, (_, i) => DAYS[(s + i) % 7]!) }

/** "Every 2 weeks on Tuesday and Thursday, until Dec 31, 2026." */
export function ruleSentence(r: Rule, dtstart: string, locale: string) {
  const list = (items: string[]) => new Intl.ListFormat(locale, { type: 'conjunction' }).format(items)
  const unit = { DAILY: 'day', WEEKLY: 'week', MONTHLY: 'month', YEARLY: 'year' }[r.FREQ]
  let s = r.INTERVAL > 1 ? `Every ${r.INTERVAL} ${unit}s` : `Every ${unit}`
  if (r.FREQ === 'WEEKLY' && r.BYDAY.length) s += ` on ${list(weekOrder(locale).filter(d => r.BYDAY.includes(d)).map(d => dayName(d, locale)))}`
  if (r.FREQ === 'MONTHLY') {
    if (r.BYMONTHDAY === -1) s += ' on the last day'
    else if (r.BYDAY.length) {
      const n = parseInt(r.BYDAY[0]!)
      s += ` on the ${n < 0 ? 'last' : NTH[n]} ${dayName(r.BYDAY[0]!.slice(-2), locale)}`
    } else s += ` on day ${r.BYMONTHDAY ?? ymd(dtstart)[2]}`
  }
  if (r.FREQ === 'YEARLY') s += ` on ${fmt(dtstart, { month: 'long', day: 'numeric' }, locale)}`
  if (r.COUNT) s += `, ${r.COUNT} ${r.COUNT === 1 ? 'time' : 'times'}`
  else if (r.UNTIL) s += `, until ${fmt(r.UNTIL, { dateStyle: 'medium' }, locale)}`
  return s
}
export { dayName as weekdayName }
