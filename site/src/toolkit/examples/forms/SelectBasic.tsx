import { Select } from '@weft-js/warp'
import { REGION_OPTIONS } from './shared'

export const SelectBasic = () => (
  <Select label="Region" options={REGION_OPTIONS} defaultValue="eu-west" />
)
