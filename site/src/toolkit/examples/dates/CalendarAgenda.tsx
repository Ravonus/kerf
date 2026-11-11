import { Calendar } from '@kerf/veneer'

import {
  CAL_NOW,
  CAL_TODAY,
  CALENDARS,
  EVENTS,
} from '../../world'

import { AGENDA_VIEWS } from './shared-event'

export const CalendarAgenda = () => (
  <Calendar
    events={EVENTS}
    calendars={CALENDARS}
    views={[...AGENDA_VIEWS]}
    defaultView="agenda"
    defaultDate={CAL_TODAY}
    today={CAL_TODAY}
    now={CAL_NOW}
    locale="en-US"
    firstDayOfWeek={1}
    readOnly
  />
)
