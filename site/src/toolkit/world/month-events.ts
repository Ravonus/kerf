import { EVENTS } from './calendar-events'

export const MONTH_EXTRA = [
  ['Q1 planning', '2026-10-27T10:00', 3],
  ['Acme QBR', '2026-10-29T15:00', 4],
  ['Ship 26.10', '2026-10-30T11:00', 1],
  ['Planning', '2026-11-09T10:00', 3],
  ['Billing v2', '2026-11-09T14:00', 4],
  ['Postgres 17', '2026-11-10T07:00', 2],
  ['Ranking v2', '2026-11-10T14:00', 3],
  ['Sec review', '2026-11-11T13:00', 4],
  ['Ship 26.11.1', '2026-11-12T11:00', 1],
  ['1:1 with Jun', '2026-11-12T15:30', 3],
  ['Design crit', '2026-11-13T10:00', 3],
  ['Load test', '2026-11-16T09:00', 2],
  ['Acme sync', '2026-11-16T13:00', 4],
  ['Team lunch', '2026-11-17T12:00', 3],
  ['Debrief', '2026-11-17T15:00', 2],
  ['Ship 26.11.2', '2026-11-19T11:00', 1],
  ['Interview', '2026-11-19T14:00', 3],
  ['Board prep', '2026-11-20T16:00', 4],
  ['Demo day', '2026-11-23T15:00', 3],
  ['DB failover', '2026-11-24T10:00', 2],
  ['Globex call', '2026-11-24T14:00', 4],
  ['Roadmap', '2026-11-25T11:00', 3],
  ['Ship 26.11.3', '2026-11-30T11:00', 1],
  ['Design crit', '2026-11-30T14:00', 3],
  ['2027 plan', '2026-12-01T10:00', 3],
  ['Initech pilot', '2026-12-02T13:00', 4],
  ['Chaos drill', '2026-12-03T09:00', 2],
  ['Ship 26.12.1', '2026-12-04T11:00', 1],
] as const

export const MONTH_DAYS = Array.from(
  { length: 42 },
  (_, i) =>
    new Date(Date.UTC(2026, 9, 26 + i))
      .toISOString()
      .slice(0, 10),
)

export const MONTH_EVENTS = [
  ...EVENTS,
  ...MONTH_DAYS.filter(
    (d) => d > '2026-11-06' || d < '2026-11-02',
  )
    .filter(
      (d) =>
        [1, 2, 3, 4, 5].includes(
          new Date(`${d}T12:00Z`).getUTCDay(),
        ) &&
        d !== '2026-11-26' &&
        d !== '2026-11-27',
    )
    .map((d) => ({
      id: `s-${d}`,
      title: 'Standup',
      start: `${d}T09:30`,
      end: `${d}T09:45`,
      cal: 3,
      recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR',
    })),
  ...MONTH_EXTRA.map(([title, start, cal], i) => ({
    id: `m${i}`,
    title,
    start,
    end:
      start.slice(0, 11) +
      String(+start.slice(11, 13) + 1).padStart(2, '0') +
      start.slice(13),
    cal,
  })),
  {
    id: 'a3',
    title: 'Sam on call',
    start: '2026-11-09',
    end: '2026-11-15',
    allDay: true,
    cal: 2,
  },
  {
    id: 'a4',
    title: 'Inés on call',
    start: '2026-11-16',
    end: '2026-11-22',
    allDay: true,
    cal: 2,
  },
  {
    id: 'a5',
    title: 'Offsite',
    location: 'Lisbon',
    start: '2026-11-18',
    end: '2026-11-19',
    allDay: true,
    cal: 3,
  },
  {
    id: 'a6',
    title: 'No deploys',
    start: '2026-11-25',
    end: '2026-11-25',
    allDay: true,
    cal: 1,
  },
  {
    id: 'a7',
    title: 'US holiday',
    start: '2026-11-26',
    end: '2026-11-27',
    allDay: true,
    cal: 3,
  },
  {
    id: 'a8',
    title: 'Jun on call',
    start: '2026-11-30',
    end: '2026-12-06',
    allDay: true,
    cal: 2,
  },
]
