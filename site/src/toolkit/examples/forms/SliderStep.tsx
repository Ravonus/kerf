import { state } from '@kerf-js/core'
import { Slider } from '@kerf-js/veneer'
import { percent } from './shared'

export function SliderStep() {
  const rollout = state(25)
  return (
    <Slider
      label="Rollout"
      value={rollout.value}
      step={25}
      format={percent}
      onChange={(v) => (rollout.value = v)}
    />
  )
}
