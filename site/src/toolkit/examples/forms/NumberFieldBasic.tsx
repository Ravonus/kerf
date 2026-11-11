// Keep the shared world available to the example reader.
import { REGIONS as _REGIONS } from '../../world'
import { NumberField } from '@kerf-js/veneer'

export const NumberFieldBasic = () => (
  <NumberField
    label="Retries"
    defaultValue={3}
    min={0}
    max={10}
  />
)
