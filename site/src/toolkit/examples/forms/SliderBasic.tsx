// Keep the shared world available to the example reader.
import { REGIONS as _REGIONS } from '../../world'
import { state } from '@weft-js/core'
import { Slider } from '@weft-js/warp'

export function SliderBasic() {
  const copies = state(3)
  return (
    <Slider
      label="Copies"
      value={copies.value}
      min={1}
      max={8}
      onChange={(v) => (copies.value = v)}
    />
  )
}
