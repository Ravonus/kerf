import { InlineCalendar } from '@weft-js/warp'

import { TODAY, booked } from './shared-event'

import { REGIONS as _REGIONS } from '../../world'

export const InlineCalendarBooking = () => (
  <InlineCalendar
    aria-label="Pick a day for the audit"
    today={TODAY}
    defaultValue="2026-11-18"
    min={TODAY}
    max="2026-12-20"
    isDateUnavailable={booked}
    firstDayOfWeek={1}
    weekNumbers
  />
)
