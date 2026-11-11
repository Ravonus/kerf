// Per-instance state for a combined date and time picker.
import { derived, state, untrack } from '@kerf-js/core'
import {
  daysIn,
  fmt,
  isoOf,
  readDate,
  readTime,
  type ChangeReason,
  type IsoDateTime,
  type SegmentPart,
} from '@kerf-js/veneer-core'
import { bindable, useOpen, usePickerEnv } from './Picker'
import type { SegmentState } from './Segments'
import type { DateTimeFieldProps } from './TimeField-types'

type Read<T, K extends keyof T> = { [P in K]-?: () => T[P] }
type Keys =
  | 'value'
  | 'defaultValue'
  | 'onValueChange'
  | 'open'
  | 'defaultOpen'
  | 'onOpenChange'
  | 'min'
  | 'max'
  | 'isDateUnavailable'
  | 'firstDayOfWeek'
  | 'step'
  | 'locale'
  | 'today'
  | 'name'
  | 'presentation'
  | 'label'
  | 'hint'
  | 'error'
  | 'disabled'
  | 'readonly'
/** Live access to the date-time field's props. */
export type DateTimeInput = Read<DateTimeFieldProps, Keys> & {
  rest: () => Record<string, unknown> & { required?: boolean | undefined }
}

/** Create the date-time picker's state under the caller's owner. */
export function dateTimeModel(input: DateTimeInput) {
  const env = usePickerEnv(input.locale, input.today)
  const value = bindable<IsoDateTime | null>(
    input.value,
    input.defaultValue,
    null,
    input.onValueChange,
  )
  const pop = useOpen(input.open, input.defaultOpen, input.onOpenChange)
  const date = state<string | null>(untrack(() => value.value?.slice(0, 10) ?? null))
  const time = state<string | null>(untrack(() => value.value?.slice(11) ?? null))
  const refs: { trigger: HTMLButtonElement | undefined } = { trigger: undefined }
  const emit = (reason: ChangeReason) =>
    value.set(
      date.value && time.value ? (`${date.value}T${time.value}` as IsoDateTime) : null,
      reason,
    )
  const said = derived(() =>
    value.value
      ? `${fmt(value.value, { dateStyle: 'full', timeStyle: 'short' }, env.locale.value)} · wall clock, no zone`
      : input.hint(),
  )
  const onDate = (st: SegmentState, parts: SegmentPart[]) => {
    const d = readDate(parts)
    date.value = st === 'complete' && d.day! <= daysIn(d.year!, d.month!) ? isoOf(d) : null
    emit('keyboard')
  }
  const onTime = (st: SegmentState, parts: SegmentPart[]) => {
    time.value = st === 'complete' ? readTime(parts) : null
    emit('keyboard')
  }
  return { input, env, value, pop, date, time, refs, emit, said, onDate, onTime }
}
