import { state } from '@kerf/core'
import { RadioGroup } from '@kerf/veneer'
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
