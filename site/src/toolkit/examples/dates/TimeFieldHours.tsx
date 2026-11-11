import { TimeField } from '@kerf-js/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const TimeFieldHours = () => (
  <TimeField
    label="Deploy window opens"
    hint="Office hours"
    today={TODAY}
    defaultValue="10:00"
    min="08:00"
    max="18:00"
    step={60}
  />
)
