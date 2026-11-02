// Calendar arithmetic and locale data for the temporal inputs (04 §1, specimens/inputs-rich.html "date math"). Values are
// ISO strings typed by shape; a bindable never holds a Date. The maths runs in UTC, so no local DST transition can move a
// calendar date, and it is a few lines of Date.UTC rather than Temporal because a page with one date field shouldn't pay
// for a polyfill: the strings are Temporal's own format, so an app can still call Temporal.PlainDate.from(value).

export type IsoDate = `${number}-${number}-${number}`
export type IsoTime = `${number}:${number}` | `${number}:${number}:${number}`
export type IsoDateTime = `${IsoDate}T${IsoTime}`
export type IsoZoned = `${IsoDateTime}${string}[${string}]`
export type IsoMonth = `${number}-${number}`
export type IsoWeek = `${number}-W${number}`
export type IsoDuration = `P${string}`
export type TimeZoneId = string
export type DateRange = { start: IsoDate | null; end: IsoDate | null }
export type ChangeReason = 'pointer' | 'keyboard' | 'programmatic'

export const pad = (n: number, l = 2) => String(n).padStart(l, '0')
export const toIso = (y: number, m: number, d: number) => `${pad(y, 4)}-${pad(m)}-${pad(d)}` as IsoDate
export const ymd = (iso: string) => iso.split('-').map(Number) as [number, number, number]
const toDate = (iso: string) => { const [y, m, d] = ymd(iso); return new Date(Date.UTC(y, m - 1, d)) }
const fromDate = (dt: Date) => toIso(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate())
export const addDays = (iso: string, n: number) => { const d = toDate(iso); d.setUTCDate(d.getUTCDate() + n); return fromDate(d) }
/** Days in a month (1-based). */
export const daysIn = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate()
/** Months away, clamped to the shorter month: 31 Jan + 1 is 28 or 29 Feb. */
export const addMonths = (iso: string, n: number) => {
  const t = ymd(iso), d = t[2]
  let y = t[0], m = t[1] + n
  y += Math.floor((m - 1) / 12)
  m = (((m - 1) % 12) + 12) % 12 + 1
  return toIso(y, m, Math.min(d, daysIn(y, m)))
}
export const monthStart = (iso: string) => `${iso.slice(0, 8)}01` as IsoDate
export const monthEnd = (iso: string) => { const [y, m] = ymd(iso); return toIso(y, m, daysIn(y, m)) }
/** 0 is Sunday. */
export const dow = (iso: string) => toDate(iso).getUTCDay()
export const daysBetween = (a: string, b: string) => Math.round((toDate(b).getTime() - toDate(a).getTime()) / 864e5)
/** Today on this machine's wall clock (or in `timeZone`). */
export const todayIso = (timeZone?: string) => {
  const p = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date())
  const of = (t: string) => +p.find(x => x.type === t)!.value
  return toIso(of('year'), of('month'), of('day'))
}

const formats = new Map<string, Intl.DateTimeFormat>()
const formatter = (locale: string, opts: Intl.DateTimeFormatOptions) => {
  const k = locale + JSON.stringify(opts)
  let f = formats.get(k)
  if (!f) formats.set(k, (f = new Intl.DateTimeFormat(locale, { ...opts, timeZone: opts.timeZone ?? 'UTC' })))
  return f
}
/** An ISO date (or date-time, read as wall time) in `locale`. */
export const fmt = (iso: string, opts: Intl.DateTimeFormatOptions, locale: string) => formatter(locale, opts).format(/T/.test(iso) ? new Date(`${iso.length === 16 ? `${iso}:00` : iso}Z`) : toDate(iso))
export const fmtTime = (hm: string, locale: string, hourCycle?: string) => fmt(`2026-01-01T${hm}`, { hour: 'numeric', minute: '2-digit', hourCycle: hourCycle === 'auto' ? undefined : hourCycle as Intl.DateTimeFormatOptions['hourCycle'] }, locale)
export const fmtRange = (a: string, b: string, locale: string, opts: Intl.DateTimeFormatOptions = { dateStyle: 'medium' }) => formatter(locale, opts).formatRange(toDate(a), toDate(b))

type WeekInfo = { firstDay: number; weekend: number[] }
const weekInfo = (locale: string): WeekInfo | null => {
  try {
    const l = new Intl.Locale(locale) as Intl.Locale & { getWeekInfo?(): WeekInfo; weekInfo?: WeekInfo }
    return l.getWeekInfo?.() ?? l.weekInfo ?? null
  } catch { return null }
}
/** The locale's first day of the week, 0 is Sunday (CLDR's main Sunday-first regions as the fallback). */
export const weekStart = (locale: string) => {
  const w = weekInfo(locale)
  return w ? w.firstDay % 7 : /-(US|CA|JP|BR|MX|IN|KR|IL)$/.test(locale) ? 0 : 1
}
export const weekendDays = (locale: string) => weekInfo(locale)?.weekend.map(d => d % 7) ?? [0, 6]
/** The locale's region, for a default country: the subtag, or what likely subtags give (de → DE). */
export const regionOf = (locale: string, fallback = 'US') => { try { return new Intl.Locale(locale).maximize().region ?? fallback } catch { return fallback } }

/** The ISO week of a date: `{ year, week }` (the year owning the week's Thursday). */
export function isoWeek(iso: string) {
  const thursday = addDays(iso, 3 - ((dow(iso) + 6) % 7))
  const year = ymd(thursday)[0]
  return { year, week: Math.floor(daysBetween(`${year}-01-01`, thursday) / 7) + 1 }
}
/** A week's Monday, from `2026-W44`. */
export function isoWeekStart(week: string) {
  const [y, w] = week.split('-W').map(Number) as [number, number]
  const jan4 = toIso(y, 1, 4)
  return addDays(jan4, (w - 1) * 7 - ((dow(jan4) + 6) % 7))
}
export const weekOf = (iso: string) => { const { year, week } = isoWeek(iso); return `${year}-W${pad(week)}` as IsoWeek }

export const clamp = (n: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, n))

/** Words for the temporal inputs (the spec's message table); an app's other languages come through `messages`. */
export const MESSAGES = {
  en: { today: 'today', unavailable: 'unavailable', start: 'start of range', end: 'end of range', mid: 'in range', prev: 'Previous month', next: 'Next month', todayBtn: 'Today', clear: 'Clear', choose: 'Choose date', chooseRange: 'Choose dates', chooseTime: 'Choose time', done: 'Done', week: 'Week' },
  de: { today: 'heute', unavailable: 'nicht verfügbar', start: 'Beginn des Zeitraums', end: 'Ende des Zeitraums', mid: 'im Zeitraum', prev: 'Vorheriger Monat', next: 'Nächster Monat', todayBtn: 'Heute', clear: 'Löschen', choose: 'Datum wählen', chooseRange: 'Zeitraum wählen', chooseTime: 'Uhrzeit wählen', done: 'Fertig', week: 'Woche' },
  ja: { today: '今日', unavailable: '選択できません', start: '期間の開始', end: '期間の終了', mid: '期間内', prev: '前の月', next: '次の月', todayBtn: '今日', clear: 'クリア', choose: '日付を選択', chooseRange: '期間を選択', chooseTime: '時刻を選択', done: '完了', week: '週' },
}
export type Messages = typeof MESSAGES.en
export const messages = (locale: string): Messages => MESSAGES[locale.slice(0, 2) as keyof typeof MESSAGES] ?? MESSAGES.en

/** A pasted date: ISO, the locale's numeric order, or a month name in the UI locale or English. Two-digit years pivot ±50 around today. */
export function parseDate(text: string, locale: string, today = todayIso()): IsoDate | null {
  const s = text.trim()
  const valid = (y: number, mo: number, d: number) => (y && mo >= 1 && mo <= 12 && d >= 1 && d <= daysIn(y, mo) ? toIso(y, mo, d) : null)
  const year = (y: number) => {
    if (y >= 100) return y
    const now = ymd(today)[0], c = Math.floor(now / 100) * 100
    return c + y > now + 50 ? c + y - 100 : c + y
  }
  const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})/.exec(s)
  if (iso) return valid(+iso[1]!, +iso[2]!, +iso[3]!)
  const lower = s.toLowerCase()
  let month = 0
  for (const loc of [locale, 'en']) for (let i = 1; i <= 12 && !month; i++) for (const style of ['long', 'short'] as const) {
    const name = fmt(toIso(2026, i, 1), { month: style }, loc).toLowerCase().replace(/\.$/, '')
    if (name.length > 2 && lower.includes(name)) { month = i; break }
  }
  const nums = (s.match(/\d+/g) ?? []).map(Number)
  if (month && nums.length >= 2) {
    const y = nums.find(n => n > 31) ?? nums[1]!
    return valid(year(y), month, nums.find(n => n !== y && n <= 31) ?? 0)
  }
  if (nums.length === 3) {
    const order = formatter(locale, { year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(0)).filter(p => p.type !== 'literal').map(p => p.type)
    const o: Record<string, number> = {}
    order.forEach((t, i) => (o[t] = nums[i]!))
    return valid(year(o.year!), o.month!, o.day!)
  }
  return null
}

export function parseTime(text: string): IsoTime | null {
  const m = /(\d{1,2})[:.h]?(\d{2})?\s*([ap])?/i.exec(text.trim())
  if (!m) return null
  let h = +m[1]!
  const mi = +(m[2] ?? 0)
  if (m[3]) h = h % 12 + (/p/i.test(m[3]) ? 12 : 0)
  return h < 24 && mi < 60 ? `${pad(h)}:${pad(mi)}` as IsoTime : null
}

/** Minutes since midnight. */
export const minutes = (t: string) => { const [h, m] = t.split(':').map(Number) as [number, number]; return h * 60 + m }
export const fromMinutes = (m: number) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}` as IsoTime

/** The UTC offset of `zone` at a wall time, in minutes. */
export function offsetAt(zone: string, utcMs: number) {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: zone, timeZoneName: 'longOffset' }).formatToParts(new Date(utcMs)).find(p => p.type === 'timeZoneName')!.value
  const m = /([+-])(\d{2}):?(\d{2})?/.exec(name)
  return m ? (m[1] === '-' ? -1 : 1) * (+m[2]! * 60 + +(m[3] ?? 0)) : 0
}
/** `UTC+01:00` for a zone at a date. */
export const offsetName = (zone: string, date: string) => {
  const o = offsetAt(zone, Date.parse(`${date}T12:00:00Z`))
  return `UTC${o < 0 ? '-' : '+'}${pad(Math.floor(Math.abs(o) / 60))}:${pad(Math.abs(o) % 60)}`
}

/**
 * How a wall time lands in a zone on a date. `gap`: it doesn't exist (02:30 on spring-forward), so `disambiguation:
 * "compatible"` moves it later; `fold`: it happens twice, and the earlier one is meant. `null`: nothing to say.
 */
export function wallTimeIssue(date: string, time: string, zone: string): { kind: 'gap'; resolved: IsoTime } | { kind: 'fold'; resolved: IsoTime } | null {
  const wall = Date.parse(`${date}T${time.length === 5 ? `${time}:00` : time}Z`)
  const a = offsetAt(zone, wall - 864e5), b = offsetAt(zone, wall + 864e5)
  if (a === b) return null
  const before = wall - a * 6e4, after = wall - b * 6e4
  const stays = (at: number, o: number) => offsetAt(zone, at) === o
  const early = stays(before, a), late = stays(after, b)
  if (early && late && a !== b) return { kind: 'fold', resolved: time.slice(0, 5) as IsoTime }
  if (!early && !late) return { kind: 'gap', resolved: fromMinutes((minutes(time) + (b - a) + 1440) % 1440) }
  return null
}

// ISO durations, the subset the field edits: days, hours, minutes, seconds
export type DurationParts = { d: number; h: number; m: number; s: number }
export function parseDuration(iso: string | null | undefined): DurationParts {
  const m = /^P(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(iso ?? '')
  return { d: +(m?.[1] ?? 0), h: +(m?.[2] ?? 0), m: +(m?.[3] ?? 0), s: +(m?.[4] ?? 0) }
}
export function formatDuration({ d, h, m, s }: DurationParts) {
  const time = `${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s ? `${s}S` : ''}`
  return `P${d ? `${d}D` : ''}${time ? `T${time}` : d ? '' : 'T0M'}` as IsoDuration
}
export const totalSeconds = (p: DurationParts) => p.d * 86400 + p.h * 3600 + p.m * 60 + p.s
/** Carry into the largest allowed unit (`PT90M` → `PT1H30M`). */
export function balance(total: number, units: readonly string[]): DurationParts {
  const out = { d: 0, h: 0, m: 0, s: 0 }
  for (const [u, size] of [['d', 86400], ['h', 3600], ['m', 60], ['s', 1]] as const) if (units.includes(u)) { out[u] = Math.floor(total / size); total -= out[u] * size }
  return out
}
