import { state } from '@kerf-js/core'
import {
  Agenda,
  AgendaDay,
  AvailabilityEditor,
  BookingCalendar,
  Button,
  Card,
  EventEditor,
  EventPopover,
  MeetingPlanner,
  MoveSheet,
  Row,
  Stack,
  Text,
  Toaster,
  YearView,
  toast,
} from '@kerf-js/veneer'
import type {
  BookingDetails,
  BookingSlot,
} from '@kerf-js/veneer'
import { at, clock } from '@kerf-js/veneer-core'
import type { CalEvent, Slot } from '@kerf-js/veneer-core'
import {
  DEPLOYS_BY_DAY,
  SCHEDULE_NOW,
  ON_CALL_HOURS,
  TEAM_CALENDARS,
  TEAM_EVENTS,
  TEAM_MORE,
  TEAM_ROOM,
  TEAM_ZONE,
  TODAY,
} from '../world'

const REVIEW = TEAM_EVENTS.find((e) => e.id === 'e4')!
const when = (e: CalEvent) => {
  const date = e.start.slice(0, 10)
  const start = e.start.slice(11)
  const end = e.end.slice(11)
  return `${date}, ${start} to ${end}`
}
const pause = (ms: number) =>
  new Promise((done) => {
    setTimeout(done, ms)
  })

export function AgendaTeamWeek() {
  const events = state(TEAM_EVENTS)
  const move = (
    e: CalEvent,
    to: { start: string; end: string },
  ) =>
    (events.value = events.value.map((x) =>
      x.id === e.id ? { ...x, ...to } : x,
    ))
  return (
    <div style="block-size:620px;position:relative">
      <Agenda
        events={events.value}
        calendars={TEAM_CALENDARS}
        defaultDate={TODAY}
        today={TODAY}
        now={SCHEDULE_NOW}
        timeZone={TEAM_ZONE}
        locale="en-GB"
        firstDayOfWeek={1}
        onMove={move}
        onCreate={(e) =>
          (events.value = [...events.value, e])
        }
      />
    </div>
  )
}

export const AgendaDayToday = () => (
  <div data-scope="agenda">
    <AgendaDay
      events={TEAM_EVENTS}
      day={TODAY}
      now={SCHEDULE_NOW}
      locale="en-GB"
      label="Tuesday"
    />
  </div>
)

export const AgendaDayEmpty = () => (
  <div data-scope="agenda">
    <AgendaDay
      events={TEAM_EVENTS}
      day="2026-11-07"
      locale="en-GB"
      label="Saturday"
    />
  </div>
)

export const AvailabilityEditorOnCall = () => (
  <AvailabilityEditor
    defaultValue={ON_CALL_HOURS}
    zoneLabel="Stockholm (CET)"
    today={TODAY}
    locale="en-GB"
    onSave={() => pause(600)}
  />
)

const TIMES = [540, 570, 600, 630, 660, 780, 810, 840]
const slotsFor = (date: string): BookingSlot[] =>
  TIMES.map((s, i) => ({
    s,
    disabled: (i + Number(date.slice(8))) % 4 === 0,
  }))
const isWeekend = (date: string) =>
  new Date(date).getUTCDay() % 6 === 0

export function BookingCalendarOnboarding() {
  const booked = state<BookingDetails | null>(null)
  const book = async (b: BookingDetails) => {
    await pause(800)
    booked.value = b
  }
  return (
    <Stack gap="related">
      <BookingCalendar
        slots={slotsFor}
        defaultDate={TODAY}
        min={TODAY}
        today={TODAY}
        locale="en-GB"
        duration={30}
        isDateUnavailable={isWeekend}
        onBook={book}
      />
      {booked.value && (
        <Text
          role="caption"
          subtle
        >
          {'Onboarding call booked for '}
          {booked.value.date} at{' '}
          {clock(booked.value.s, 'en-GB')}.
        </Text>
      )}
    </Stack>
  )
}

export const BookingCalendarLoading = () => (
  <BookingCalendar
    slots={[]}
    loading
    defaultDate={TODAY}
    today={TODAY}
    locale="en-GB"
    onBook={() => {}}
  />
)

const bookingError =
  "We couldn't load the times. Try again in a moment."

export const BookingCalendarFailed = () => (
  <BookingCalendar
    slots={[]}
    error={bookingError}
    defaultDate={TODAY}
    today={TODAY}
    locale="en-GB"
    onBook={() => {}}
  />
)

export function EventEditorChange() {
  const open = state(false)
  const event = state(REVIEW)
  return (
    <Card
      title={event.value.title}
      sweep={false}
    >
      <Stack gap="related">
        <Text subtle>
          {when(event.value)}
          {event.value.location
            ? `, ${event.value.location}`
            : ''}
        </Text>
        <Row>
          <Button
            emphasis="outline"
            tone="neutral"
            icon="settings"
            onClick={() => (open.value = true)}
          >
            Edit event
          </Button>
        </Row>
      </Stack>
      <EventEditor
        open={open}
        event={event.value}
        calendars={TEAM_CALENDARS}
        timeZone={TEAM_ZONE}
        today={TODAY}
        locale="en-GB"
        onSave={(e) => (event.value = e)}
      />
    </Card>
  )
}

const BLANK: CalEvent = {
  id: 'new',
  title: '',
  start: `${TODAY}T14:00`,
  end: `${TODAY}T14:30`,
  cal: 1,
}

export function EventEditorNew() {
  const open = state(false)
  const added = state<CalEvent[]>([])
  const save = (e: CalEvent) =>
    (added.value = [
      ...added.value,
      { ...e, id: `new-${added.value.length}` },
    ])
  return (
    <Stack gap="related">
      {added.value.map((e) => (
        <Text key={e.id}>
          {e.title}: {when(e)}
        </Text>
      ))}
      {!added.value.length && (
        <Text subtle>Nothing added yet.</Text>
      )}
      <Row>
        <Button
          icon="plus"
          onClick={() => (open.value = true)}
        >
          New event
        </Button>
      </Row>
      <EventEditor
        open={open}
        event={BLANK}
        isNew
        calendars={TEAM_CALENDARS}
        timeZone={TEAM_ZONE}
        today={TODAY}
        locale="en-GB"
        onSave={save}
      />
    </Stack>
  )
}

export function EventPopoverDetails() {
  const open = state(false)
  const said = state(
    'Open the event, then join, edit or delete it.',
  )
  let opener: HTMLElement | undefined
  return (
    <Stack
      gap="related"
      align="center"
    >
      <Button
        ref={(n: HTMLElement) => (opener = n)}
        emphasis="outline"
        tone="neutral"
        onClick={() => (open.value = !open.value)}
      >
        {REVIEW.title}
      </Button>
      <Text
        role="caption"
        subtle
      >
        {said.value}
      </Text>
      <EventPopover
        event={REVIEW}
        open={open}
        anchor={() => opener}
        side="bottom"
        align="center"
        zoneLabel="Stockholm (CET)"
        locale="en-GB"
        hourCycle="h23"
        onJoin={() => (said.value = 'Joining the call')}
        onEdit={() => (said.value = 'Editing')}
        onDelete={() => (said.value = 'Deleted')}
      />
    </Stack>
  )
}

export function MeetingPlannerReview() {
  const sent = () => {
    toast.show({
      title: 'Invite sent',
      description: 'Everyone has it on their calendar.',
    })
    return pause(400)
  }
  const search = (q: string) =>
    Promise.resolve(
      TEAM_MORE.filter((p) =>
        p.name.toLowerCase().includes(q.toLowerCase()),
      ),
    )
  return (
    <>
      <MeetingPlanner
        date={TODAY}
        attendees={TEAM_ROOM}
        loadAttendees={search}
        title="Capacity review"
        link="meet.kerf.dev/capacity"
        tags={['Internal', 'Incident', 'Planning']}
        timeZone={TEAM_ZONE}
        today={TODAY}
        locale="en-GB"
        hourCycle="h23"
        onSubmit={sent}
        onUndo={() =>
          toast.show({ title: 'Invite withdrawn' })
        }
      />
      <Toaster />
    </>
  )
}

export function MoveSheetReschedule() {
  const open = state(false)
  const event = state(REVIEW)
  const move = (e: CalEvent, to: Slot) =>
    (event.value = {
      ...e,
      start: at(to.date, to.s),
      end: at(to.date, to.e),
    })
  return (
    <Card
      title={event.value.title}
      sweep={false}
    >
      <Stack gap="related">
        <Text subtle>{when(event.value)}</Text>
        <Row>
          <Button
            emphasis="outline"
            tone="neutral"
            onClick={() => (open.value = true)}
          >
            Move
          </Button>
        </Row>
      </Stack>
      <MoveSheet
        open={open}
        event={event.value}
        events={TEAM_EVENTS}
        firstDayOfWeek={1}
        locale="en-GB"
        hourCycle="h23"
        onMove={move}
      />
    </Card>
  )
}

export const YearViewDeploys = () => (
  <YearView
    counts={DEPLOYS_BY_DAY}
    events={TEAM_EVENTS}
    label="Deploys in 2026"
    year={2026}
    today={TODAY}
    locale="en-GB"
    firstDayOfWeek={1}
    direct={false}
  />
)
