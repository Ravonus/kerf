import { TimeField } from '@kerf-js/veneer'

import { TODAY, SLOTS } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const TimeFieldSlots = () => (
  <TimeField
    label="Onboarding call"
    hint="Only the times Priya is free"
    today={TODAY}
    defaultValue="11:00"
    slots={SLOTS}
  />
)
