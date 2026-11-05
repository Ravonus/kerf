import { Calendar } from '@weft-js/warp'

import { BUSY_NOW, BUSY_TODAY, CALENDARS } from '../../world'

import { useEvents, DAY_VIEWS } from './shared-event'

/** Wednesday's morning runs five meetings into each other: they share the column side by side, in lanes. */
export function CalendarBusyDay() {
  const s = useEvents()
  return (
    <Calendar
      events={s.events.value}
      calendars={CALENDARS}
      views={[...DAY_VIEWS]}
      defaultView="day"
      defaultDate={BUSY_TODAY}
      today={BUSY_TODAY}
      now={BUSY_NOW}
      locale="en-US"
      firstDayOfWeek={1}
      workingHours={[540, 1080]}
      onMove={s.change}
      onResize={s.change}
    />
  )
}
