import { Calendar } from '@weft-js/warp'

import { CAL_NOW, CAL_TODAY, CALENDARS, MONTH_EVENTS } from '../../world'

import { COMPACT_VIEWS } from './shared-event'

/** The month carries the whole month's meetings, not only this week's. */
export const CalendarMonth = () => (
  <Calendar
    events={MONTH_EVENTS}
    calendars={CALENDARS}
    views={[...COMPACT_VIEWS]}
    defaultView="month"
    defaultDate={CAL_TODAY}
    today={CAL_TODAY}
    now={CAL_NOW}
    locale="en-US"
    firstDayOfWeek={1}
    readOnly
  />
)
