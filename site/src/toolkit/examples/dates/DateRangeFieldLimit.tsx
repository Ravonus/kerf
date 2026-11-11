import { DateRangeField } from '@kerf-js/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const DateRangeFieldLimit = () => (
  <DateRangeField
    label="Log export"
    hint="Up to 14 days at a time"
    today={TODAY}
    presets={false}
    months={1}
    maxDays={14}
    max={TODAY}
    defaultValue={{
      start: '2026-10-20',
      end: '2026-10-27',
    }}
  />
)
