// Keep the shared world available to the example reader.
import { REGIONS as _REGIONS } from '../../world'
import { NumberField } from '@weft-js/warp'

/** Money: a prefix for the currency, and steps of 50.
 * PageUp and PageDown move by ten steps. */
export const NumberFieldMoney = () => (
  <NumberField
    label="Monthly budget"
    defaultValue={1500}
    min={0}
    step={50}
    prefix="$"
    hint="We email you at 80%."
  />
)
