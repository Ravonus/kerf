import { state } from '@kerf/core'
import { Slider } from '@kerf/veneer'
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
