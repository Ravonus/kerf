import { state } from '@kerf-js/core'
import { RadioGroup } from '@kerf-js/veneer'
import { NEAR } from './shared'

/** A label can hold more than words: each region
 * carries its round trip from you. */
export function RadioGroupRich() {
  const region = state('eu-west')
  return (
    <RadioGroup
      label="Region"
      value={region.value}
      options={NEAR}
      onChange={(v) => (region.value = v)}
    />
  )
}
