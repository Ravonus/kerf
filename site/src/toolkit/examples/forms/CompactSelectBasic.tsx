import { CompactSelect } from '@weft-js/warp'
import { REGION_OPTIONS } from './shared'

export const CompactSelectBasic = () => (
  <CompactSelect label="Region" options={REGION_OPTIONS} defaultValue="eu-west" />
)
