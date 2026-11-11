// The schedule pack on the a11y gallery (?part=schedule): rendered by test/a11y/gallery.tsx. Everything on one page with
// real data; `?open=…` opens an overlay. Named `XCase` exports are the hydration suite's.
import {
  countByDay,
  type Attendee,
  type CalEvent,
  type IsoDate,
  type WeekDay,
} from '@kerf/veneer-core'
import { state } from '@kerf/core'
import { Toaster } from '../../src/Toast'
import { Agenda } from '../../src/schedule/Agenda'
import { AvailabilityEditor } from '../../src/schedule/AvailabilityEditor'
import { BookingCalendar } from '../../src/schedule/BookingCalendar'
import { Calendar } from '../../src/schedule/Calendar'
import { MeetingPlanner } from '../../src/schedule/MeetingPlanner'
import { YearView } from '../../src/schedule/YearView'

const TODAY = '2026-10-28',
  NOW = '2026-10-28T10:40',
  ZONE = 'America/New_York'
const on = (d: number) => (d > 31 ? `2026-11-0${d - 31}` : `2026-10-${d}`)
const t = (d: number, h: string) => `${on(d)}T${h}`
let n = 0
const ev = (
  d: number,
  [s, e]: [string, string],
  title: string,
  cal: number,
  o: Partial<CalEvent> = {},
): CalEvent => ({ id: `e${++n}`, title, start: t(d, s), end: t(d, e), cal, ...o })
const makeEvents = (): CalEvent[] => {
  n = 0
  return [
    ...[26, 27, 28, 29, 30].map((d) =>
      ev(d, ['09:00', '09:15'], 'Standup', 1, {
        recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
        location: 'Room Atlas',
        attendees: ['Ana Ruiz', 'Kofi Mensah', 'Mei Tanaka', 'You'],
      }),
    ),
    ev(26, ['10:00', '11:30'], 'Design crit', 2, {
      location: 'Studio · Figma',
      attendees: ['Mei Tanaka', 'Léa Martin', 'You'],
      video: true,
    }),
    ev(26, ['13:00', '14:00'], 'Lunch with Ana', 5, { location: 'Pasta place' }),
    ev(26, ['15:00', '16:00'], '1:1 Kofi', 3, {
      recurrence: 'FREQ=WEEKLY;INTERVAL=2',
      video: true,
      attendees: ['Kofi Mensah', 'You'],
    }),
    ev(27, ['11:00', '12:00'], 'Roadmap review', 4, {
      tentative: true,
      location: 'Maybe · awaiting Raj',
      attendees: ['Raj Patel', 'Ana Ruiz', 'You'],
    }),
    ev(27, ['11:30', '12:30'], 'Vendor call', 6, { video: true }),
    ev(27, ['14:00', '17:00'], 'Focus: calendar engine', 7, {
      location: 'Do not book',
      locked: true,
    }),
    ev(28, ['10:00', '11:00'], 'Interview · Frontend', 3, {
      video: true,
      attendees: ['Sam Okafor', 'You'],
      resource: 'birch',
    }),
    ev(28, ['10:30', '11:15'], 'Release sync', 8, {
      attendees: ['Ivy Chen', 'You'],
      resource: 'atlas',
    }),
    ev(28, ['10:45', '12:00'], 'Pairing with Mei', 2, {
      location: 'Overlap layout',
      attendees: ['Mei Tanaka', 'You'],
      resource: 'cedar',
    }),
    ev(28, ['15:30', '16:30'], 'Sprint planning', 4, {
      recurrence: 'FREQ=WEEKLY',
      video: true,
      resource: 'atlas',
    }),
    ev(28, ['13:00', '13:30'], 'Lunch', 5),
    ev(29, ['09:30', '10:30'], 'Customer call · Acme', 6, { video: true }),
    ev(29, ['12:00', '13:00'], 'Brown bag: Temporal', 1),
    ev(29, ['14:00', '15:30'], 'Design crit', 2, { recurrence: 'FREQ=WEEKLY' }),
    ev(30, ['11:00', '12:00'], 'Retro', 4, { video: true }),
    ev(30, ['16:00', '17:00'], 'Demo day', 8, { location: 'All hands' }),
    ev(31, ['10:00', '12:00'], 'Climbing', 5, { location: 'Boulder gym' }),
    { id: 'a1', title: 'Offsite prep', start: on(26), end: on(27), allDay: true, cal: 4 },
    { id: 'a2', title: 'Ana out of office', start: on(28), end: on(28), allDay: true, cal: 5 },
    { id: 'a3', title: 'Release 2026.11', start: on(30), end: on(30), allDay: true, cal: 8 },
  ]
}
const CALS = [
  'Team',
  'Design',
  'Hiring',
  'Planning',
  'Personal',
  'Customers',
  'Focus',
  'Releases',
].map((name, i) => ({ id: i + 1, name }))
const ROOMS = [
  { id: 'atlas', name: 'Atlas', meta: '8 seats' },
  { id: 'birch', name: 'Birch', meta: '6 seats' },
  { id: 'cedar', name: 'Cedar', meta: '12 seats' },
]
const PEOPLE: Attendee[] = [
  {
    id: 'you',
    name: 'You',
    organizer: true,
    zone: ZONE,
    busy: [
      [540, 555],
      [600, 660],
      [630, 720],
      [780, 810],
      [930, 990],
    ],
  },
  {
    id: 'ana',
    name: 'Ana Ruiz',
    zone: 'Europe/Lisbon',
    hours: [540, 1080],
    busy: [
      [480, 600],
      [780, 840],
    ],
  },
  {
    id: 'kofi',
    name: 'Kofi Mensah',
    zone: 'Africa/Accra',
    hours: [540, 1080],
    busy: [
      [540, 555],
      [690, 750],
      [900, 960],
    ],
  },
  { id: 'mei', name: 'Mei Tanaka', zone: 'Asia/Tokyo', busy: [[600, 720]] },
]
const MORE: Attendee[] = [
  {
    id: 'raj',
    name: 'Raj Patel',
    zone: ZONE,
    busy: [
      [660, 720],
      [1020, 1080],
    ],
  },
  { id: 'sam', name: 'Sam Okafor', zone: 'Europe/London' },
]
const WEEK: WeekDay[] = [1, 2, 3, 4, 5, 6, 0].map((day) => ({
  day,
  on: day > 0 && day < 6,
  ranges:
    day === 3
      ? [
          [540, 720],
          [780, 1020],
        ]
      : [[540, 1020]],
}))
const SLOTS = [540, 570, 600, 630, 660, 780, 810, 840].map((s) => ({ s, disabled: s === 630 }))
const SAMPLE = makeEvents()
const COUNTS = countByDay(SAMPLE)

export function useEvents() {
  const events = state(makeEvents())
  const move = (e: CalEvent, to: { start: string; end: string; resource?: string | undefined }) => {
    events.value = events.value.map((x) => (x.id === e.id ? { ...x, ...to } : x))
  }
  return {
    events,
    move,
    create: (e: CalEvent) => {
      events.value = [...events.value, e]
    },
    edit: (e: CalEvent) => {
      events.value = events.value.map((x) => (x.id === e.id ? e : x))
    },
    remove: (e: CalEvent) => {
      events.value = events.value.filter((x) => x.id !== e.id)
    },
  }
}

function Cal({ view }: { view: 'week' | 'month' | 'agenda' | 'timeline' | 'year' | 'day' }) {
  const s = useEvents()
  return (
    <Calendar
      events={s.events.value}
      calendars={CALS}
      defaultView={view}
      defaultDate={TODAY}
      today={TODAY}
      now={NOW}
      locale="en-US"
      firstDayOfWeek={1}
      timeZone={ZONE}
      zones={[
        { label: 'New York', zone: ZONE },
        { label: 'Lisbon', zone: 'Europe/Lisbon' },
        { label: 'Tokyo', zone: 'Asia/Tokyo' },
      ]}
      live="live"
      resources={ROOMS}
      onMove={s.move}
      onResize={s.move}
      onCreate={s.create}
      onEdit={s.edit}
      onDelete={s.remove}
    />
  )
}
export const CalendarCase = () => <Cal view="week" />
export const DayCase = () => <Cal view="day" />
export const MonthCase = () => <Cal view="month" />
export const AgendaViewCase = () => <Cal view="agenda" />
export const TimelineCase = () => <Cal view="timeline" />
export const YearTabCase = () => <Cal view="year" />
export function AgendaCase() {
  const s = useEvents()
  return (
    <Agenda
      events={s.events.value}
      defaultDate={TODAY}
      today={TODAY}
      now={NOW}
      locale="en-US"
      firstDayOfWeek={1}
      calendars={CALS}
      onMove={s.move}
      onCreate={s.create}
    />
  )
}
export const YearCase = () => (
  <YearView
    counts={COUNTS}
    events={SAMPLE}
    today={TODAY}
    locale="en-US"
    firstDayOfWeek={1}
    direct={false}
    openDay={() => true}
    openMonth={() => true}
  />
)
export const BookingCase = () => (
  <BookingCalendar
    slots={SLOTS}
    defaultDate={TODAY as IsoDate}
    today={TODAY}
    locale="en-US"
    onBook={() => undefined}
  />
)
export const PlannerCase = () => (
  <MeetingPlanner
    date={TODAY}
    attendees={PEOPLE}
    loadAttendees={async (q) => MORE.filter((p) => p.name.toLowerCase().includes(q.toLowerCase()))}
    title="Q4 calendar engine review"
    link="meet.example.com/q4-review"
    tags={['Internal', 'Customer', 'Interview']}
    timeZone={ZONE}
    today={TODAY}
    locale="en-US"
    onSubmit={() => undefined}
    onUndo={() => undefined}
  />
)
export const AvailabilityCase = () => (
  <AvailabilityEditor
    defaultValue={{
      week: WEEK,
      overrides: [
        { id: 'o1', date: '2026-11-26', ranges: null, note: 'Thanksgiving' },
        { id: 'o2', date: '2026-12-24', ranges: [[540, 780]], note: 'Half day' },
      ],
    }}
    zoneLabel="New York (EDT)"
    today={TODAY}
    locale="en-US"
    onSave={() => undefined}
  />
)

export function Part() {
  const view = (new URLSearchParams(location.search).get('view') ?? 'week') as 'week'
  return (
    <>
      <h1>veneer schedule</h1>
      <Toaster />
      <h2>Calendar</h2>
      <div data-frame="desk" style="block-size:760px;border:1px solid var(--veneer-color-border)">
        <Cal view={view} />
      </div>
      <h2>Agenda</h2>
      <div
        data-frame="phone"
        style="block-size:720px;max-inline-size:390px;position:relative;border:1px solid var(--veneer-color-border)"
      >
        <AgendaCase />
      </div>
      <h2>Year</h2>
      <YearCase />
      <h2>Booking</h2>
      <BookingCase />
      <h2>Planner</h2>
      <PlannerCase />
      <h2>Availability</h2>
      <AvailabilityCase />
    </>
  )
}
