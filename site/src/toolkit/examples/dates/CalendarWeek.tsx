import { Calendar } from '@kerf-js/veneer'

import {
  CAL_NOW,
  CAL_TODAY,
  CALENDARS,
} from '../../world'

import { useEvents } from './shared-event'

export function CalendarWeek() {
  const s = useEvents()
  return (
    <Calendar
      events={s.events.value}
      calendars={CALENDARS}
      defaultView="week"
      defaultDate={CAL_TODAY}
      today={CAL_TODAY}
      now={CAL_NOW}
      locale="en-US"
      firstDayOfWeek={1}
      workingHours={[540, 1080]}
      onMove={s.change}
      onResize={s.change}
      onCreate={s.create}
      onEdit={s.edit}
      onDelete={s.remove}
    />
  )
}
