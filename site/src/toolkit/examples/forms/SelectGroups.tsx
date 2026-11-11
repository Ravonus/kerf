import { Select } from '@kerf/veneer'
import { TARGET_OPTIONS } from './shared'

export const SelectGroups = () => (
  <Select
    label="Deploy to"
    options={TARGET_OPTIONS}
    defaultValue="staging"
  />
)
