import { state } from '@weft-js/core'
import { Slider } from '@weft-js/warp'
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
