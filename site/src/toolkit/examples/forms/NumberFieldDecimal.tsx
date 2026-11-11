// Keep the shared world available to the example reader.
import { REGIONS as _REGIONS } from '../../world'
import { NumberField } from '@kerf/veneer'

/** A fraction steps by its `step`: a quarter of a CPU
 * at a time, with the unit as a suffix. */
export const NumberFieldDecimal = () => (
  <NumberField
    label="CPU per copy"
    defaultValue={0.5}
    min={0.25}
    max={8}
    step={0.25}
    suffix="vCPU"
  />
)
