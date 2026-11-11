import {
  ClockIcon,
  InfoIcon,
  PinIcon,
  RepeatIcon,
  UsersIcon,
  VideoIcon,
} from '@kerf-js/veneer-icons'
import {
  clockRange,
  dateOf,
  fmt,
  longDuration,
  popover,
  ruleSentence,
  parseRule,
  slotOf,
  type Align,
  type CalEvent,
  type Side,
} from '@kerf-js/veneer-core'
import { derived, untrack, type State } from '@kerf-js/core'
import { Avatar } from '../parts'
import { Badge } from '../Badge'
import { Button } from '../Button'
import { use } from '@kerf-js/veneer-core/kerf'
import '@kerf-js/veneer-core/styles/components/popover.css'
import '@kerf-js/veneer-core/styles/app/avatar-stack.css'
import '@kerf-js/veneer-core/styles/app/event-card.css'

/** Props for EventPopover. */
export type EventPopoverProps = {
  event: CalEvent | null
  open: State<boolean>
  /** The element it hangs from; focus returns there. */
  anchor: () => HTMLElement | undefined
  /** "New York (EDT)". */
  zoneLabel?: string | undefined
  locale?: string | undefined
  /** `h12` for AM and PM, `h23` for a 24-hour clock. The locale's otherwise. */
  hourCycle?: string | undefined
  side?: Side | undefined
  align?: Align | undefined
  onEdit?: ((e: CalEvent) => void) | undefined
  onDelete?: ((e: CalEvent) => void) | undefined
  onJoin?: ((e: CalEvent) => void) | undefined
}

function eventTime(p: EventPopoverProps) {
  const locale = derived(() => p.locale ?? 'en-US')
  const when = derived(() => {
    const e = p.event
    if (!e) return null
    const s = slotOf(e),
      l = locale.value
    return {
      date: fmt(dateOf(e.start), { weekday: 'long', month: 'short', day: 'numeric' }, l),
      time: e.allDay ? 'All day' : clockRange(s.s, s.e, l, p.hourCycle),
      length: e.allDay ? undefined : longDuration(s.e - s.s),
    }
  })
  return { locale, when }
}

function eventDetails(
  p: EventPopoverProps,
  when: ReturnType<typeof eventTime>['when'],
  locale: ReturnType<typeof eventTime>['locale'],
) {
  return (
    <dl>
      <dt>
        <ClockIcon />
      </dt>
      <dd>
        {when.value!.date} · {when.value!.time}
        {(when.value!.length || p.zoneLabel) && (
          <>
            <br />
            <span class="muted">
              {[when.value!.length, p.zoneLabel].filter(Boolean).join(' · ')}
            </span>
          </>
        )}
      </dd>
      {p.event!.recurrence && (
        <>
          <dt>
            <RepeatIcon />
          </dt>
          <dd>
            {ruleSentence(parseRule(p.event!.recurrence), dateOf(p.event!.start), locale.value)}
          </dd>
        </>
      )}
      {p.event!.location && (
        <>
          <dt>
            <PinIcon />
          </dt>
          <dd>{p.event!.location}</dd>
        </>
      )}
      {p.event!.attendees?.length ? (
        <>
          <dt>
            <UsersIcon />
          </dt>
          <dd>
            <span data-scope="avatar-stack">
              {p.event!.attendees.slice(0, 5).map((n) => (
                <Avatar key={n} name={n} size="sm" />
              ))}
            </span>{' '}
            <span class="muted">{p.event!.attendees.length} going</span>
          </dd>
        </>
      ) : null}
      {p.event!.tentative && (
        <>
          <dt>
            <InfoIcon />
          </dt>
          <dd>
            <Badge tone="caution">Tentative</Badge>
          </dd>
        </>
      )}
    </dl>
  )
}

/** The event card (07 §2.1, `#ev-pop`): a non-modal dialog on the event; Escape returns to it. */
export function EventPopover(p: EventPopoverProps) {
  let panel: HTMLDivElement | undefined
  const props = untrack(() => p)
  const { locale, when } = eventTime(props)
  const close = () => (p.open.value = false)
  use(
    popover,
    () => panel,
    () => ({
      open: p.open.value,
      trigger: p.anchor()!,
      side: p.side ?? 'right',
      align: p.align ?? 'start',
      onClose: close,
    }),
  )
  const act = (f?: (e: CalEvent) => void) => () => {
    const e = p.event!
    close()
    f?.(e)
  }
  return (
    <div
      ref={(n) => (panel = n)}
      data-scope="popover"
      data-part="content"
      popover="manual"
      role="dialog"
      aria-label="Event details"
    >
      {p.event && (
        <div data-scope="event-card" data-cal={p.event.cal ?? 1}>
          <h4 data-part="title">{p.event.title}</h4>
          {eventDetails(p, when, locale)}
          <div data-part="actions">
            {!p.event.locked && p.onDelete && (
              <Button emphasis="ghost" tone="critical" size="sm" onClick={act(p.onDelete)}>
                Delete
              </Button>
            )}
            {!p.event.locked && p.onEdit && (
              <Button emphasis="outline" tone="neutral" size="sm" onClick={act(p.onEdit)}>
                Edit
              </Button>
            )}
            {p.event.video && (
              <Button size="sm" onClick={act(p.onJoin)}>
                <VideoIcon />
                Join
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
