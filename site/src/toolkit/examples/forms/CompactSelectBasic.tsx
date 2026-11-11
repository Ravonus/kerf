import { CompactSelect } from '@kerf/veneer'
import { REGION_OPTIONS } from './shared'

export const CompactSelectBasic = () => (
  <CompactSelect
    label="Region"
    options={REGION_OPTIONS}
    defaultValue="eu-west"
  />
)
