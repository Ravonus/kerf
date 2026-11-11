import { Select } from '@kerf-js/veneer'
import { PROJECT_OPTIONS } from './shared'

export const SelectSearchable = () => (
  <Select
    label="Project"
    searchable
    options={PROJECT_OPTIONS}
    defaultValue="checkout"
  />
)
