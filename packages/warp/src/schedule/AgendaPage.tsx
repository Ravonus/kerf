import { fmt, type CalEvent } from '@weft-js/warp-core'
import { AgendaDay } from './AgendaDay'

export function AgendaPage({
  day,
  offset,
  locale,
  events,
  now,
  hourCycle,
}: {
  day: string
  offset: number
  locale: string
  events: CalEvent[]
  now: string | null | undefined
  hourCycle: string | undefined
}) {
  return (
    <div
      data-part="page"
      aria-hidden={offset ? 'true' : undefined}
      inert={offset ? true : undefined}
    >
      <div data-part="day-title">
        <h4>{fmt(day, { weekday: 'long' }, locale)}</h4>
        <span class="muted">{fmt(day, { month: 'short', day: 'numeric' }, locale)}</span>
      </div>
      <AgendaDay
        events={events}
        day={day}
        now={now}
        locale={locale}
        hourCycle={hourCycle}
        label={fmt(day, { weekday: 'long' }, locale)}
      />
    </div>
  )
}
