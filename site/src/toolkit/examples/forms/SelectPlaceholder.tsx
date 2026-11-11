import { Select } from '@kerf/veneer'
import { REGION_OPTIONS } from './shared'

export const SelectPlaceholder = () => (
  <Select
    label="Region"
    placeholder="Choose a region"
    options={REGION_OPTIONS}
  />
)
