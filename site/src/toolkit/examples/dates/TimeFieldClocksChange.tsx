import { TimeField } from '@kerf/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const TimeFieldClocksChange = () => (
  <TimeField
    label="Nightly backup"
    today={TODAY}
    defaultValue="01:30"
    date="2026-11-01"
    timeZone="America/New_York"
  />
)
