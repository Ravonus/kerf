import type { CalEvent } from '@kerf/veneer-core'

export const TODAY = '2026-11-03'

export const SCHEDULE_NOW = '2026-11-03T10:40'

export const TEAM_ZONE = 'Europe/Stockholm'

export const TEAM_CALENDARS = [
  'Platform',
  'Web',
  'Data',
  'Mobile',
  'Releases',
  'Time off',
].map((name, i) => ({ id: i + 1, name }))

export const TEAM_EVENTS: CalEvent[] = [
  {
    id: 'e1',
    title: 'Platform standup',
    start: '2026-11-02T09:00',
    end: '2026-11-02T09:15',
    cal: 1,
    recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    location: 'Room Atlas',
    attendees: ['Mara Lindqvist', 'Jun Tanaka'],
  },
  {
    id: 'e2',
    title: 'Platform standup',
    start: '2026-11-03T09:00',
    end: '2026-11-03T09:15',
    cal: 1,
    recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    location: 'Room Atlas',
    attendees: ['Mara Lindqvist', 'Jun Tanaka'],
  },
  {
    id: 'e3',
    title: 'Checkout review',
    start: '2026-11-03T10:00',
    end: '2026-11-03T11:00',
    cal: 2,
    video: true,
    attendees: [
      'Priya Raman',
      'Tomás Oliveira',
      'Mara Lindqvist',
    ],
  },
  {
    id: 'e4',
    title: 'Incident review: mobile-bff',
    start: '2026-11-03T13:00',
    end: '2026-11-03T13:45',
    cal: 4,
    video: true,
    location: 'Room Birch',
    attendees: ['Sam Okafor', 'Inés Vidal', 'Jun Tanaka'],
  },
  {
    id: 'e5',
    title: 'Ranking v2 handover',
    start: '2026-11-03T15:00',
    end: '2026-11-03T16:00',
    cal: 3,
    location: 'Room Cedar',
    attendees: ['Lena Fischer', 'Noor Haddad'],
  },
  {
    id: 'e6',
    title: 'Priya out of office',
    start: '2026-11-03',
    end: '2026-11-03',
    allDay: true,
    cal: 6,
  },
  {
    id: 'e7',
    title: 'Release 2026.11',
    start: '2026-11-04T11:00',
    end: '2026-11-04T12:00',
    cal: 5,
    attendees: [
      'Mara Lindqvist',
      'Jun Tanaka',
      'Tomás Oliveira',
    ],
  },
  {
    id: 'e8',
    title: 'Design crit',
    start: '2026-11-04T14:00',
    end: '2026-11-04T15:00',
    cal: 2,
    tentative: true,
    video: true,
  },
  {
    id: 'e9',
    title: 'Cost review',
    start: '2026-11-05T10:00',
    end: '2026-11-05T11:00',
    cal: 1,
    recurrence: 'FREQ=MONTHLY',
    attendees: ['Mara Lindqvist', 'Lena Fischer'],
  },
  {
    id: 'e10',
    title: 'On-call handover',
    start: '2026-11-06T16:00',
    end: '2026-11-06T16:30',
    cal: 1,
    recurrence: 'FREQ=WEEKLY',
    video: true,
  },
]
