// Per-instance state for the time picker.
import { derived, state } from '@kerf-js/core'
import {
  fmt,
  fmtTime,
  readTime,
  wallTimeIssue,
  type IsoTime,
  type SegmentPart,
} from '@kerf-js/veneer-core'
import { bindable, isSheet, messages, useOpen, usePickerEnv } from './Picker'
import { stepSlots } from './TimeField-slots'
import type { SegmentState } from './Segments'
import type { TimeFieldProps } from './TimeField-types'

type Read<T, K extends keyof T> = { [P in K]-?: () => T[P] }
type Keys =
  | 'value'
  | 'defaultValue'
  | 'onValueChange'
  | 'open'
  | 'defaultOpen'
  | 'onOpenChange'
  | 'hourCycle'
  | 'step'
  | 'seconds'
  | 'min'
  | 'max'
  | 'slots'
  | 'date'
  | 'timeZone'
  | 'locale'
  | 'today'
  | 'name'
  | 'presentation'
  | 'label'
  | 'hint'
  | 'error'
  | 'disabled'
  | 'readonly'
/** Live access to the time field's props. */
export type TimeInput = Read<TimeFieldProps, Keys> & {
  rest: () => Record<string, unknown> & { required?: boolean | undefined }
}

/** Create the time picker's state under the caller's owner. */
export function timeModel(input: TimeInput) {
  const env = usePickerEnv(input.locale, input.today)
  const value = bindable<IsoTime | null>(input.value, input.defaultValue, null, input.onValueChange)
  const pop = useOpen(input.open, input.defaultOpen, input.onOpenChange)
  const started = state(false)
  const sheet = state(false)
  const text = derived(() => messages(env.locale.value))
  const options = derived(() => input.slots() ?? stepSlots(input.step()!, input.min(), input.max()))
  const refs: { trigger: HTMLButtonElement | undefined } = { trigger: undefined }
  const dst = derived(() => {
    if (!value.value || !input.date() || !input.timeZone()) return undefined
    const issue = wallTimeIssue(input.date()!, value.value, input.timeZone()!)
    if (!issue) return undefined
    const day = fmt(input.date()!, { month: 'short', day: 'numeric' }, env.locale.value)
    const city = input.timeZone()!.split('/').pop()!.replace(/_/g, ' ')
    const at = fmtTime(value.value, env.locale.value, input.hourCycle())
    return issue.kind === 'gap'
      ? `${at} doesn't exist on ${day} in ${city}; using ${fmtTime(issue.resolved, env.locale.value, input.hourCycle())}.`
      : `${at} happens twice on ${day} in ${city}; using the first.`
  })
  const onEdit = (st: SegmentState, parts: SegmentPart[]) => {
    started.value = st !== 'empty'
    if (st === 'empty') return value.set(null, 'keyboard')
    if (st === 'complete') {
      const x = readTime(parts)
      if (x) value.set(x, 'keyboard')
    }
  }
  const open = () => {
    sheet.value = isSheet(refs.trigger!, input.presentation())
    pop.set(true)
  }
  return { input, env, value, pop, started, sheet, text, options, refs, dst, onEdit, open }
}
