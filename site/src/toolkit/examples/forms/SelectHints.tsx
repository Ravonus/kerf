import { Select } from '@kerf/veneer'
import { ROLE_OPTIONS } from './shared'

export const SelectHints = () => (
  <Select
    label="Role"
    options={ROLE_OPTIONS}
    defaultValue="Member"
  />
)
