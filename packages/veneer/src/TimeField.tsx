import type { TimeFieldProps, DateTimeFieldProps } from './TimeField-types'
import { timeModel } from './TimeField-model'
import { timeView } from './TimeField-view'
import { dateTimeModel } from './TimeField-date-model'
import { dateTimeView } from './TimeField-date-view'
import '@kerf-js/veneer-core/styles/rich/listbox.css'
import '@kerf-js/veneer-core/styles/rich/datetime.css'

export { stepSlots } from './TimeField-slots'

export type { TimeFieldProps, DateTimeFieldProps } from './TimeField-types'

/**
 * TimeField (04 §2): segments in the locale's order and cycle; the trigger opens a slot list (wheels in a phone
 * sheet). With `date` and `timeZone`, a wall time that doesn't exist or happens twice gets a hint, and a missing one
 * resolves with `disambiguation: "compatible"`.
 */
export function TimeField({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  hourCycle,
  step = 15,
  seconds,
  min,
  max,
  slots,
  date,
  timeZone,
  locale,
  today,
  name,
  presentation,
  label,
  hint,
  error,
  disabled,
  readonly,
  ...rest
}: TimeFieldProps) {
  return timeView(
    timeModel({
      value: () => value,
      defaultValue: () => defaultValue,
      onValueChange: () => onValueChange,
      open: () => open,
      defaultOpen: () => defaultOpen,
      onOpenChange: () => onOpenChange,
      hourCycle: () => hourCycle,
      step: () => step,
      seconds: () => seconds,
      min: () => min,
      max: () => max,
      slots: () => slots,
      date: () => date,
      timeZone: () => timeZone,
      locale: () => locale,
      today: () => today,
      name: () => name,
      presentation: () => presentation,
      label: () => label,
      hint: () => hint,
      error: () => error,
      disabled: () => disabled,
      readonly: () => readonly,
      rest: () => rest,
    }),
  )
}

/**
 * DateTimeField (04 §2): a date group and a time group in one control and one popover, calendar beside the slot list.
 * The value is a wall time with no zone; the hint spells it out in full.
 */
export function DateTimeField({
  value,
  defaultValue,
  onValueChange,
  open,
  defaultOpen,
  onOpenChange,
  min,
  max,
  isDateUnavailable,
  firstDayOfWeek,
  step = 30,
  locale,
  today,
  name,
  presentation,
  label,
  hint,
  error,
  disabled,
  readonly,
  ...rest
}: DateTimeFieldProps) {
  return dateTimeView(
    dateTimeModel({
      value: () => value,
      defaultValue: () => defaultValue,
      onValueChange: () => onValueChange,
      open: () => open,
      defaultOpen: () => defaultOpen,
      onOpenChange: () => onOpenChange,
      min: () => min,
      max: () => max,
      isDateUnavailable: () => isDateUnavailable,
      firstDayOfWeek: () => firstDayOfWeek,
      step: () => step,
      locale: () => locale,
      today: () => today,
      name: () => name,
      presentation: () => presentation,
      label: () => label,
      hint: () => hint,
      error: () => error,
      disabled: () => disabled,
      readonly: () => readonly,
      rest: () => rest,
    }),
  )
}
