import { CompactSelect } from '@kerf-js/veneer'
import { REGION_OPTIONS } from './shared'

export const CompactSelectBasic = () => (
  <CompactSelect
    label="Region"
    options={REGION_OPTIONS}
    defaultValue="eu-west"
  />
)
