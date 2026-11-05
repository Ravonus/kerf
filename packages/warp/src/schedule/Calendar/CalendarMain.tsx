import { YearView } from '../YearView'

import type { CalendarProps } from '../Calendar'
import { AgendaView } from './AgendaView'
import { type useCalendarActions, type useCalendarNav } from './calendar-shell'
import type { Ctx } from './calendar-state'
import { MonthGrid } from './MonthGrid'
import { TimeGrid } from './TimeGrid'
import { Timeline } from './Timeline'
type Nav = ReturnType<typeof useCalendarNav>
type Actions = ReturnType<typeof useCalendarActions>
type Props = { p: CalendarProps; c: Ctx; nav: Nav; actions: Actions; id: string }
export function CalendarMain({ p, c, actions, id }: Props) {
  return (
    <div
      data-part="main"
      id={`${id}-main`}
      role="tabpanel"
      aria-labelledby={`${id}-${c.view.value}`}
      style="min-block-size:0;min-inline-size:0;display:grid;position:relative"
    >
      {c.view.value === 'week' || c.view.value === 'day' ? (
        <TimeGrid c={c} count={7} />
      ) : c.view.value === 'month' ? (
        <MonthGrid c={c} />
      ) : c.view.value === 'agenda' ? (
        <AgendaView c={c} />
      ) : c.view.value === 'timeline' ? (
        <Timeline c={c} />
      ) : (
        <div data-part="year-wrap">
          <YearView
            label="Year view"
            counts={c.counts.value}
            events={c.all.value}
            today={c.env.today.value}
            locale={c.env.locale.value}
            hourCycle={p.hourCycle}
            firstDayOfWeek={c.first.value}
            openDay={actions.openDay}
            openMonth={actions.openMonth}
          />
        </div>
      )}
    </div>
  )
}
