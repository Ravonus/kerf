// Keep the shared world available to the example reader.
import { REGIONS as _REGIONS } from '../../world'
import { state } from '@kerf/core'
import { Slider } from '@kerf/veneer'

export function SliderRange() {
  const copies = state<[number, number]>([2, 6])
  return (
    <Slider
      label="Copies"
      value={copies.value}
      min={1}
      max={12}
      names={['Fewest copies', 'Most copies']}
      onChange={(v) => (copies.value = v)}
    />
  )
}
