import {
  agendaItems,
  clock,
  longDuration,
  type AgendaItem,
  type CalEvent,
} from '@weft-js/warp-core'
import { derived } from '@weft-js/core'
import { RepeatGlyph, tint } from './bits'

const summary = (e: CalEvent) =>
  [
    e.location,
    e.video ? 'Video call' : '',
    e.attendees?.length ? `${e.attendees.length} people` : '',
  ]
    .filter(Boolean)
    .join(' · ')

function Row({
  item,
  hourCycle,
  locale,
}: {
  item: AgendaItem
  hourCycle?: string | undefined
  locale: string
}) {
  const time = (m: number) => clock(m, locale, hourCycle)
  return (
    <>
      {item.kind === 'now' ? (
        <div
          data-part="now"
          role="listitem"
          aria-label={`Now, ${time(item.at)}`}
          aria-current="time"
        >
          <span aria-hidden="true">{time(item.at)}</span>
          <i></i>
        </div>
      ) : item.kind === 'free' ? (
        <div data-part="free" role="listitem">
          <span></span>
          <span>{longDuration(item.minutes)} free</span>
        </div>
      ) : item.kind === 'allday' ? (
        <div
          data-part="row"
          data-allday=""
          data-cal={item.event.cal ?? 1}
          style={tint(item.event.cal)}
          role="listitem"
          data-id={item.event.id}
          tabindex="0"
        >
          <time>All day</time>
          <i></i>
          <div>
            <b>{item.event.title}</b>
          </div>
        </div>
      ) : (
        <div
          data-part="row"
          data-cal={item.event.cal ?? 1}
          style={tint(item.event.cal)}
          data-id={item.event.id}
          role="listitem"
          tabindex="0"
          aria-label={`${item.event.title}, ${time(item.s)} to ${time(item.e)}`}
        >
          <time>
            {time(item.s)}
            <small>{time(item.e)}</small>
          </time>
          <i></i>
          <div>
            <b>
              {item.event.recurrence && <RepeatGlyph />}
              {item.event.recurrence ? ' ' : ''}
              {item.event.title}
            </b>
            <span>{summary(item.event) || longDuration(item.e - item.s)}</span>
          </div>
        </div>
      )}
    </>
  )
}

/** One day's list of rows; the Agenda pages and the Calendar's Agenda view both draw it. */
export function AgendaDay({
  events,
  day,
  now,
  locale,
  hourCycle,
  label,
}: {
  events: CalEvent[]
  day: string
  now?: string | null | undefined
  locale: string
  hourCycle?: string | undefined
  label: string
}) {
  const items = derived(() => agendaItems(events, day, now))
  return (
    <>
      {items.value.length ? (
        <div role="list" aria-label={label}>
          {items.value.map((i) => (
            <Row key={i.key} item={i} locale={locale} hourCycle={hourCycle} />
          ))}
        </div>
      ) : (
        <div data-scope="empty-state">
          <p data-part="description">Nothing scheduled. Enjoy it.</p>
        </div>
      )}
    </>
  )
}
