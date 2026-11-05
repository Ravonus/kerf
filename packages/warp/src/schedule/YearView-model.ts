import {
  announce,
  eventsOn,
  fmt,
  monthStart,
  monthSummary,
  monthWeeks,
  motionOff,
  uid,
  weekStart,
  weekdays,
  ymd,
  yearKey,
  yearMonths,
  yearTotal,
  type IsoDate,
} from '@weft-js/warp-core'
import { derived, flush, state, untrack } from '@weft-js/core'
import { usePickerEnv } from '../Picker'
import type { YearViewProps } from './YearView'

const events = (n: number) => (n ? `${n} event${n > 1 ? 's' : ''}` : 'no events')

export function yearData(p: YearViewProps) {
  const id = uid('year')
  const env = usePickerEnv(
    () => p.locale,
    () => p.today,
  )
  const first = derived(() => p.firstDayOfWeek ?? weekStart(env.locale.value))
  const heads = derived(() => weekdays(first.value, env.locale.value))
  const focus = state<string>(
    untrack(() =>
      p.year && p.year !== ymd(env.today.value)[0] ? `${p.year}-01-01` : env.today.value,
    ),
  )
  const year = derived(() => ymd(focus.value)[0])
  const picked = state<{ iso: string; kind: 'day' | 'month' } | null>(null)
  const swapping = state(false)
  const list = derived(() =>
    yearMonths(year.value).map((month) => {
      const { total } = monthSummary(p.counts, month)
      return {
        month,
        total,
        name: fmt(month, { month: 'long' }, env.locale.value),
        current: month === monthStart(env.today.value),
        weeks: monthWeeks(month, first.value).map((days, r) => ({
          key: `${month}-${r}`,
          cells: days.map((iso, c) => ({
            key: iso ?? `${month}-${r}-${c}`,
            iso,
            count: iso ? (p.counts[iso] ?? 0) : 0,
            weekend: (first.value + c) % 7 === 0 || (first.value + c) % 7 === 6,
          })),
        })),
      }
    }),
  )
  return { id, env, first, heads, focus, year, picked, swapping, list }
}

export function yearDetail(
  p: YearViewProps,
  data: ReturnType<typeof yearData>,
  long: (iso: string) => string,
) {
  const { env, year, picked } = data
  const detail = derived(() => {
    const at = picked.value
    if (!at || ymd(at.iso)[0] !== year.value) return null
    if (at.kind === 'month') {
      const s = monthSummary(p.counts, at.iso)
      return {
        kind: 'month' as const,
        iso: at.iso,
        head: `${fmt(at.iso, { month: 'long', year: 'numeric' }, env.locale.value)} · ${s.total} events`,
        busiest: s.busiest ? `Busiest day: ${long(s.busiest)}, ${s.most} events.` : undefined,
      }
    }
    const n = p.counts[at.iso] ?? 0
    const rows = p.events ? eventsOn(p.events, at.iso) : []
    return {
      kind: 'day' as const,
      iso: at.iso,
      head: `${long(at.iso)} · ${n ? events(n) : 'nothing booked'}`,
      rows: rows.slice(0, 4),
      more: Math.max(0, rows.length - 4),
    }
  })
  return detail
}

export function yearNavigation(p: YearViewProps, data: ReturnType<typeof yearData>) {
  const { env, first, focus, year, picked, swapping } = data
  let months: HTMLDivElement | undefined
  const say = (t: string) => months && announce(months.ownerDocument, t)
  const long = (iso: string) =>
    fmt(iso, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }, env.locale.value)
  const toCell = () => {
    flush()
    months?.querySelector<HTMLElement>('[data-day][tabindex="0"]')?.focus()
  }
  const go = (iso: string, move = true) => {
    const was = year.value
    const swap = ymd(iso)[0] !== was
    const apply = () => {
      focus.value = iso
      swapping.value = false
      if (move) toCell()
      if (swap) {
        say(
          `${ymd(iso)[0]}, ${yearTotal(p.counts, ymd(iso)[0]).toLocaleString(env.locale.value)} events`,
        )
        p.onYearChange?.(ymd(iso)[0])
      }
    }
    if (!swap || !months || motionOff(months)) return apply()
    swapping.value = true
    setTimeout(apply, 140)
  }
  const dayName = (iso: string) => `${long(iso)}, ${events(p.counts[iso] ?? 0)}`
  const day = (iso: string) => {
    if (p.direct !== false && p.openDay?.(iso as IsoDate)) return say(`Day view, ${long(iso)}`)
    focus.value = iso
    picked.value = { iso, kind: 'day' }
    say(dayName(iso))
  }
  const month = (iso: string) => {
    const m = monthStart(iso)
    if (p.direct !== false && p.openMonth?.(m))
      return say(`Month view, ${fmt(m, { month: 'long', year: 'numeric' }, env.locale.value)}`)
    focus.value = m
    picked.value = { iso: m, kind: 'month' }
    toCell()
    const s = monthSummary(p.counts, m)
    say(`${fmt(m, { month: 'long', year: 'numeric' }, env.locale.value)}, ${s.total} events`)
  }
  const onKey = (e: KeyboardEvent) => {
    const c = (e.target as Element).closest?.<HTMLElement>('[data-day]')
    if (!c || e.metaKey || e.ctrlKey) return
    const to = yearKey(
      e.key,
      e.shiftKey,
      c.dataset.day!,
      first.value,
      getComputedStyle(c).direction === 'rtl',
    )
    if (!to) return
    e.preventDefault()
    if (to === 'pick') day(c.dataset.day!)
    else if (to === 'month') month(c.dataset.day!)
    else if (to === 'today') go(env.today.value)
    else go(to)
  }
  const onClick = (e: MouseEvent) => {
    const t = e.target as Element
    const title = t.closest?.<HTMLElement>('[data-part="month-title"]')
    if (title) return month(title.dataset.month!)
    const c = t.closest?.<HTMLElement>('[data-day]')
    if (c) day(c.dataset.day!)
  }
  return { long, dayName, go, onKey, onClick, setMonths: (n: HTMLDivElement) => (months = n) }
}
