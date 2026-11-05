// Keep the shared world available to the example reader.
import { REGIONS as _REGIONS } from '../../world'
import { state } from '@weft-js/core'
import { Slider } from '@weft-js/warp'

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
