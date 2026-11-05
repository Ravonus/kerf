import { CompactSelect } from '@weft-js/warp'
import { REGION_OPTIONS } from './shared'

export const CompactSelectStates = () => (
  <>
    <CompactSelect
      label="Region"
      placeholder="Region"
      options={REGION_OPTIONS}
    />
    <CompactSelect
      label="Region"
      options={REGION_OPTIONS}
      defaultValue="us-east"
    />
    <CompactSelect
      label="Region"
      options={REGION_OPTIONS}
      defaultValue="us-east"
      disabled
    />
  </>
)
