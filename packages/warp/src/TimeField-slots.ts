import { fromMinutes, minutes } from '@weft-js/warp-core'

/** Generate selectable time slots at a fixed interval. */
export const stepSlots = (step: number, min?: string, max?: string) => {
  const from = min ? minutes(min) : 0,
    to = max ? minutes(max) : 1439
  const out: string[] = []
  for (let m = from; m <= to; m += step) out.push(fromMinutes(m))
  return out
}
