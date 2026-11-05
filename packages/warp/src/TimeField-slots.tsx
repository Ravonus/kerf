import { fromMinutes, minutes } from '@weft-js/warp-core'
import { Slots } from './TimeField-options'
import type { dateTimeModel } from './TimeField-date-model'

type Model = ReturnType<typeof dateTimeModel>

/** Generate selectable time slots at a fixed interval. */
export const stepSlots = (step: number, min?: string, max?: string) => {
  const from = min ? minutes(min) : 0,
    to = max ? minutes(max) : 1439
  const out: string[] = []
  for (let m = from; m <= to; m += step) out.push(fromMinutes(m))
  return out
}

/** Render the current date-time choices. */
export function DateTimeSlots({ step, m }: { step: number; m: Model }) {
  const { env, time, emit, pop } = m
  return (
    <Slots
      slots={stepSlots(step)}
      selected={time.value}
      locale={env.locale.value}
      label="Time"
      onPick={(x, reason) => {
        time.value = x
        emit(reason)
        pop.set(false)
      }}
    />
  )
}
