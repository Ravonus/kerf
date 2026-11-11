import { Stack, TimeField } from '@kerf-js/veneer'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const TimeFieldClock = () => (
  <Stack gap="group">
    <TimeField
      label="12-hour"
      today={TODAY}
      defaultValue="14:30"
      hourCycle="h12"
    />
    <TimeField
      label="24-hour"
      today={TODAY}
      defaultValue="14:30"
      hourCycle="h23"
    />
    <TimeField
      label="With seconds"
      today={TODAY}
      defaultValue="14:30:15"
      hourCycle="h23"
      seconds
    />
  </Stack>
)
