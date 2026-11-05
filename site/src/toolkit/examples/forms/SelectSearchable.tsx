import { Select } from '@weft-js/warp'
import { PROJECT_OPTIONS } from './shared'

export const SelectSearchable = () => (
  <Select
    label="Project"
    searchable
    options={PROJECT_OPTIONS}
    defaultValue="checkout"
  />
)
