import { DateRangeField } from '@kerf-js/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

// -- DateRangeField

export const DateRangeFieldPresets = () => (
  <DateRangeField
    label="Period"
    today={TODAY}
    defaultValue={{
      start: '2026-10-01',
      end: '2026-10-31',
    }}
  />
)
