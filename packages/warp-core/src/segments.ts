// Typed entry (04 §1.3): date, month and time as spinbutton segments. A reducer over plain data, so any binding renders
// the same model on the server and in the browser: parts come from Intl (en-US MM/DD/YYYY, de-DE DD.MM.YYYY, ja-JP
// YYYY/MM/DD), press() turns a key into the next model and where focus goes.
import { fmt, pad, toIso, ymd, type IsoTime } from './temporal'

/** The fields a segmented input can have. */
export type SegmentType = 'year' | 'month' | 'day' | 'hour' | 'minute' | 'second' | 'dayPeriod'
/** One editable field, with what's been typed so far. */
export interface Segment { type: SegmentType; min: number; max: number; len: number; value: number | null; buf: string; ph: string }
/** A field, or the literal text between fields. */
export type SegmentPart = Segment | { literal: string; at: number }
/** What a segmented input edits. */
export type SegmentKind = 'date' | 'time' | 'month'
/** Options for a segmented input. */
export interface SegmentOptions { hourCycle?: 'h12' | 'h23' | 'auto'; seconds?: boolean | undefined }

const PLACEHOLDER: Record<string, Partial<Record<SegmentType, string>>> = {
  en: { day: 'dd', month: 'mm', year: 'yyyy', hour: 'hh', minute: 'mm', second: 'ss' },
  de: { day: 'TT', month: 'MM', year: 'JJJJ', hour: 'hh', minute: 'mm', second: 'ss' },
  ja: { day: '日', month: '月', year: '年', hour: '時', minute: '分', second: '秒' },
}

/** Whether a part is a field, not a literal. */
export const isSegment = (p: SegmentPart): p is Segment => 'type' in p
/** Whether `locale` reads a 12-hour clock under `cycle`. */
export const hour12 = (locale: string, cycle?: SegmentOptions['hourCycle']) => {
  if (cycle === 'h12') return true
  if (cycle === 'h23') return false
  return /h1[12]/.test(new Intl.DateTimeFormat(locale, { hour: 'numeric' }).resolvedOptions().hourCycle ?? '')
}
/** The locale's two day-period words, for `AM`/`PM` in the period segment. */
export const dayPeriods = (locale: string): [string, string] => {
  const at = (h: number) => new Intl.DateTimeFormat(locale, { hour: 'numeric', hourCycle: 'h12', timeZone: 'UTC' }).formatToParts(new Date(Date.UTC(2026, 0, 1, h))).find(p => p.type === 'dayPeriod')?.value
  return [at(1) ?? 'AM', at(13) ?? 'PM']
}
/** A field's name in `locale`, for its label. */
export const fieldName = (type: SegmentType, locale: string) => {
  try { return new Intl.DisplayNames(locale, { type: 'dateTimeField' }).of(type) ?? type } catch { return type }
}

/** The ordered parts of a segment group: literals as text, segments empty. */
export function segmentParts(kind: SegmentKind, locale: string, o: SegmentOptions = {}): SegmentPart[] {
  const sample = new Date(Date.UTC(2026, 10, 28, 13, 5, 9))
  const h12 = hour12(locale, o.hourCycle)
  const parts = new Intl.DateTimeFormat(locale, kind === 'time'
    ? { hour: 'numeric', minute: '2-digit', second: o.seconds ? '2-digit' : undefined, hourCycle: h12 ? 'h12' : 'h23', timeZone: 'UTC' }
    : { year: 'numeric', month: '2-digit', day: kind === 'date' ? '2-digit' : undefined, timeZone: 'UTC' }).formatToParts(sample)
  const ph = PLACEHOLDER[locale.slice(0, 2)] ?? PLACEHOLDER.en!
  const spec: Partial<Record<SegmentType, [number, number, number]>> = { day: [1, 31, 2], month: [1, 12, 2], year: [1, 9999, 4], hour: h12 ? [1, 12, 2] : [0, 23, 2], minute: [0, 59, 2], second: [0, 59, 2], dayPeriod: [0, 1, 1] }
  const out: SegmentPart[] = []
  for (const p of parts) {
    const s = spec[p.type as SegmentType]
    if (s) out.push({ type: p.type as SegmentType, min: s[0], max: s[1], len: s[2], value: null, buf: '', ph: ph[p.type as SegmentType] ?? dayPeriods(locale)[0] })
    else if (p.type === 'literal') out.push({ literal: p.value.replace(/\s+/g, ' '), at: out.length })
  }
  return out
}

/** Whether no field has a value. */
export const isEmpty = (parts: SegmentPart[]) => parts.filter(isSegment).every(s => s.value === null)
/** Whether every field has a value, and a year being typed isn't short. */
export const isComplete = (parts: SegmentPart[]) => parts.filter(isSegment).every(s => s.value !== null && !(s.buf && s.type === 'year' && s.value < 100))

const get = (parts: SegmentPart[], type: SegmentType) => parts.filter(isSegment).find(s => s.type === type)?.value ?? null

/** The written-out date of a complete group, whether or not such a day exists (the field explains 31 Feb). */
export const readDate = (parts: SegmentPart[]) => ({ year: get(parts, 'year'), month: get(parts, 'month'), day: get(parts, 'day') })
/** The 24-hour time a complete group holds. */
export function readTime(parts: SegmentPart[]): IsoTime | null {
  const hour = get(parts, 'hour'), minute = get(parts, 'minute'), second = get(parts, 'second')
  const seg = parts.filter(isSegment)
  const period = seg.some(s => s.type === 'dayPeriod') ? get(parts, 'dayPeriod') : undefined
  if (hour === null || minute === null || period === null) return null
  const h = period === undefined ? hour : hour % 12 + (period ? 12 : 0)
  return `${pad(h)}:${pad(minute)}${seg.some(s => s.type === 'second') ? `:${pad(second ?? 0)}` : ''}` as IsoTime
}

/** Fill a group from a value (null clears it). */
export function writeParts(parts: SegmentPart[], kind: SegmentKind, value: string | null): SegmentPart[] {
  let v: Partial<Record<SegmentType, number>> = {}
  if (value && kind !== 'time') { const [year, month, day] = ymd(value); v = { year, month, day } }
  else if (value) {
    const [h, minute, second] = value.split(':').map(Number) as [number, number, number?]
    const h12 = parts.some(p => isSegment(p) && p.type === 'dayPeriod')
    v = { hour: h12 ? h % 12 || 12 : h, minute, second: second ?? 0, dayPeriod: h >= 12 ? 1 : 0 }
  }
  return parts.map(p => (isSegment(p) ? { ...p, buf: '', value: v[p.type] ?? null } : p))
}

/** What a segment shows. */
export function segmentText(s: Segment, periods: [string, string], h12 = false) {
  if (s.value === null) return s.buf || s.ph
  if (s.type === 'dayPeriod') return periods[s.value]
  if (s.type === 'year') return s.buf && s.buf.length < 4 ? s.buf : pad(s.value, 4)
  return s.type === 'hour' && h12 ? String(s.value) : pad(s.value, s.len)
}
/** What a screen reader hears for it: the month's name, the period word, else the digits. */
export function segmentValueText(s: Segment, periods: [string, string], locale: string, h12 = false) {
  if (s.value === null) return '–'
  return s.type === 'month' ? fmt(toIso(2026, s.value, 1), { month: 'long' }, locale) : segmentText(s, periods, h12)
}

/** What a key press did to the fields. */
export interface Press {
  parts: SegmentPart[]
  /** The segment (index among segments) focus moves to, if any. */
  move?: number | undefined
  /** The key was this widget's: the binding calls preventDefault. */
  handled: boolean
}

/** One key on segment `at` (an index among segments): digits fill and advance, ↑/↓ step and wrap, Backspace clears. */
export function press(parts: SegmentPart[], at: number, key: string, o: { year: number; meta?: boolean; rtl?: boolean }): Press {
  const segs = parts.filter(isSegment)
  const s = segs[at]!
  const next = (patch: Partial<Segment>, move?: number): Press => ({ parts: parts.map(p => (p === s ? { ...s, ...patch } : p)), move, handled: true })
  const last = segs.length - 1
  const forward = at < last ? at + 1 : undefined
  if (/^\d$/.test(key) && s.type !== 'dayPeriod') {
    let buf = s.buf + key
    let n = +buf
    if (n > s.max || buf.length > s.len) { buf = key; n = +key }
    const value = n < s.min && s.type !== 'year' ? (buf.length < s.len ? null : s.min) : n
    const done = s.type === 'year' ? buf.length >= 4 : buf.length >= s.len || n * 10 > s.max
    return next({ buf: done ? '' : buf, value }, done ? forward : undefined)
  }
  if (key === 'ArrowUp' || key === 'ArrowDown') {
    const d = key === 'ArrowUp' ? 1 : -1
    const span = s.max - s.min + 1
    const value = s.value === null ? (s.type === 'year' ? o.year : s.type === 'dayPeriod' ? 0 : d > 0 ? s.min : s.max) : ((s.value - s.min + d + span) % span) + s.min
    return next({ buf: '', value })
  }
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const d = (key === 'ArrowRight') !== !!o.rtl ? 1 : -1
    return { parts: parts.map(p => (p === s ? { ...s, buf: '' } : p)), move: Math.max(0, Math.min(last, at + d)), handled: true }
  }
  if (key === 'Backspace' || key === 'Delete') {
    if (s.buf.length > 1) { const buf = s.buf.slice(0, -1); return next({ buf, value: +buf }) }
    if (s.value !== null) return next({ buf: '', value: null })
    return { parts, move: key === 'Backspace' && at > 0 ? at - 1 : undefined, handled: true }
  }
  if (s.type === 'dayPeriod' && /^[apAP午]$/.test(key)) return next({ value: /[pP]/.test(key) ? 1 : 0 }, forward)
  if ('/.-: '.includes(key) && key.length === 1) return { parts: parts.map(p => (p === s ? { ...s, buf: '' } : p)), move: forward, handled: true }
  // a printable key this segment can't take: swallowed (a segment isn't a text box), never with a shortcut
  return { parts, handled: key.length === 1 && !o.meta }
}

/** Leaving a segment: a two-digit year pivots ±50 years around today; a half-typed buffer settles. */
export function settle(parts: SegmentPart[], at: number, year: number): SegmentPart[] {
  const s = parts.filter(isSegment)[at]
  if (!s) return parts
  let value = s.value
  if (s.type === 'year' && value !== null && value < 100) {
    const c = Math.floor(year / 100) * 100
    value = c + value > year + 50 ? c + value - 100 : c + value
  }
  if (value === s.value && !s.buf) return parts
  return parts.map(p => (p === s ? { ...s, value, buf: '' } : p))
}

/** The ISO date of filled-in fields. */
export const isoOf = (d: { year: number | null; month: number | null; day: number | null }) => toIso(d.year!, d.month!, d.day!)
