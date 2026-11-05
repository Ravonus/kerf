import { Calendar } from '@weft-js/warp'

import {
  BUSY_NOW,
  BUSY_TODAY,
  CALENDARS,
  ROOMS,
} from '../../world'

import {
  useEvents,
  ROOM_VIEWS,
  ROOM_HOURS,
} from './shared-event'

export function CalendarRooms() {
  const s = useEvents()
  return (
    <Calendar
      events={s.events.value}
      calendars={CALENDARS}
      resources={ROOMS}
      views={[...ROOM_VIEWS]}
      timeline={ROOM_HOURS}
      defaultView="timeline"
      defaultDate={BUSY_TODAY}
      today={BUSY_TODAY}
      now={BUSY_NOW}
      locale="en-US"
      onMove={s.change}
      onResize={s.change}
    />
  )
}
