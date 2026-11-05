import { DateTimeField } from '@weft-js/warp'

import { TODAY, isWeekend } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

/** The change freeze runs over the holidays: no
 * weekends, and nothing after the 19th. */
export const DateTimeFieldLimits = () => (
  <DateTimeField
    label="Deploy at"
    hint="Weekdays only, before the freeze on Dec 19."
    today={TODAY}
    defaultValue="2026-11-04T10:00"
    min={TODAY}
    max="2026-12-19"
    isDateUnavailable={isWeekend}
    firstDayOfWeek={1}
  />
)
