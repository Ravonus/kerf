import { DateTimeField } from '@weft-js/warp'

import { TODAY } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const DateTimeFieldStep = () => (
  <DateTimeField
    label="Reminder"
    hint="On the quarter hour"
    today={TODAY}
    defaultValue="2026-11-05T09:15"
    step={15}
    firstDayOfWeek={1}
  />
)
