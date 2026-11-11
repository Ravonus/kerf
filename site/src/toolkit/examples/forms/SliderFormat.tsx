import { state } from '@kerf/core'
import { Slider } from '@kerf/veneer'
import { gigabytes } from './shared'

export function SliderFormat() {
  const memory = state(4)
  return (
    <Slider
      label="Memory"
      value={memory.value}
      min={1}
      max={32}
      format={gigabytes}
      onChange={(v) => (memory.value = v)}
    />
  )
}
