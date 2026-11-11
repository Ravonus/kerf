import { DateField } from '@kerf/veneer'

import { TODAY, isWeekend } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const DateFieldLimits = () => (
  <DateField
    label="Maintenance day"
    hint="Weekdays, within the next 60 days"
    defaultValue="2026-11-10"
    today={TODAY}
    min="2026-11-02"
    max="2026-12-31"
    isDateUnavailable={isWeekend}
  />
)
