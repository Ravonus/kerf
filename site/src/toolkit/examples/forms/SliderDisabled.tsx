// Keep the shared world available to the example reader.
import { REGIONS as _REGIONS } from '../../world'
import { Slider } from '@kerf/veneer'

export const SliderDisabled = () => (
  <Slider
    label="Copies"
    value={3}
    min={1}
    max={8}
    disabled
    onChange={() => {}}
  />
)
