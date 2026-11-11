import { Select } from '@kerf/veneer'
import { REGION_OPTIONS } from './shared'

export const SelectBasic = () => (
  <Select
    label="Region"
    options={REGION_OPTIONS}
    defaultValue="eu-west"
  />
)
