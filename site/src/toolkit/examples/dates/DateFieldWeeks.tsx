import { DateField } from '@kerf-js/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const DateFieldWeeks = () => (
  <DateField
    label="Sprint starts"
    defaultValue="2026-11-16"
    today={TODAY}
    firstDayOfWeek={1}
    weekNumbers
  />
)
