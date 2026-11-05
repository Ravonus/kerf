import { clock, fmt, minutes, uid, type IsoDate, type IsoTime } from '@weft-js/warp-core'
import { derived, state, untrack, type State } from '@weft-js/core'
import { usePickerEnv } from '../Picker'
import { bookingActions, bookingSlots } from './BookingCalendarActions'
import type { BookingCalendarProps, BookingSlot } from './BookingCalendar'

export function bookingModel(p: () => BookingCalendarProps) {
  const id = uid('book')
  const env = usePickerEnv(
    () => p().locale,
    () => p().today,
  )
  const own = state<IsoDate | null>(
    untrack(() => (typeof p().date === 'string' ? (p().date as IsoDate) : p().defaultDate) ?? null),
  )
  const date = derived(() =>
    p().date && typeof p().date === 'object'
      ? (p().date as State<IsoDate | null>).value
      : typeof p().date === 'string'
        ? (p().date as IsoDate)
        : own.value,
  )
  const pick = state<number | null>(null)
  const manual = state(false)
  const typed = state<IsoTime | null>(null)
  const stage = state<'pick' | 'confirm' | 'done'>('pick')
  const busy = state(false)
  const failed = state<string | null>(null)
  const len = derived(() => p().duration ?? 30)
  const list = derived(() => {
    const d = date.value
    if (!d) return []
    return typeof p().slots === 'function'
      ? (p().slots as (date: string) => BookingSlot[])(d)
      : (p().slots as BookingSlot[])
  })
  const chosen = derived(() =>
    manual.value ? (typed.value ? minutes(typed.value) : null) : pick.value,
  )
  const when = derived(() => {
    const d = date.value,
      s = chosen.value
    return d && s !== null
      ? `${fmt(d, { weekday: 'short', month: 'short', day: 'numeric' }, env.locale.value)} · ${clock(s, env.locale.value, p().hourCycle)}–${clock(s + len.value, env.locale.value, p().hourCycle)}`
      : ''
  })
  let root: HTMLDivElement | undefined
  const { setDate, toConfirm, book } = bookingActions(
    p,
    own,
    date,
    pick,
    manual,
    stage,
    busy,
    failed,
    len,
    chosen,
    when,
    () => root,
  )
  const onSlots = bookingSlots()
  const empty = derived(() => !list.value.some((s) => !s.disabled))

  return {
    id,
    env,
    date,
    pick,
    manual,
    typed,
    stage,
    busy,
    failed,
    len,
    list,
    chosen,
    when,
    setDate,
    onSlots,
    toConfirm,
    book,
    empty,
    setRoot: (n: HTMLDivElement) => (root = n),
  }
}
