import { DateRangeField } from '@weft-js/warp'

import { TODAY, REPORTING, Q3 } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const DateRangeFieldCustom = () => (
  <DateRangeField
    label="Report on"
    today={TODAY}
    presets={REPORTING}
    defaultValue={Q3}
  />
)
