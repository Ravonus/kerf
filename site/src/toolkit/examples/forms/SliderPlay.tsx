import { state } from '@kerf-js/core'
import { Slider } from '@kerf-js/veneer'
import type { Knobs } from './shared'

export function SliderPlay(p: Knobs) {
  const v = state(4)
  return (
    <Slider
      {...p}
      value={v.value}
      onChange={(next: number) => (v.value = next)}
    />
  )
}
