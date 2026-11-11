import { state } from '@kerf-js/core'

import type {
  DateRange,
  IsoDate,
  IsoTime,
} from '@kerf-js/veneer'

import { EVENTS } from '../../world'

export type Event = (typeof EVENTS)[number]

export const TODAY: IsoDate = '2026-11-02'

export const isWeekend = (d: IsoDate) =>
  [0, 6].includes(new Date(`${d}T12:00Z`).getUTCDay())

// -- Calendar

export function useEvents() {
  const events = state<Event[]>(EVENTS)
  const change = (e: Event, to: Partial<Event>) => {
    events.value = events.value.map((x) =>
      x.id === e.id ? { ...x, ...to } : x,
    )
  }
  return {
    events,
    change,
    create: (e: Event) =>
      (events.value = [...events.value, e]),
    edit: (e: Event) => change(e, e),
    remove: (e: Event) =>
      (events.value = events.value.filter(
        (x) => x.id !== e.id,
      )),
  }
}

export const COMPACT_VIEWS = ['month', 'agenda'] as const

export const DAY_VIEWS = ['day', 'week'] as const

export const AGENDA_VIEWS = ['agenda', 'week'] as const

export const ROOM_VIEWS = ['timeline', 'day'] as const

/** The rooms' working day, in minutes: 09:00 to
 * 17:00 gives each hour room for a name. */
export const ROOM_HOURS: [number, number] = [540, 1020]

export const REPORTING = [
  {
    id: 'sprint',
    label: 'This sprint',
    range: (): DateRange => ({
      start: '2026-10-26',
      end: '2026-11-06',
    }),
  },
  {
    id: 'q3',
    label: 'Q3',
    range: (): DateRange => ({
      start: '2026-07-01',
      end: '2026-09-30',
    }),
  },
  {
    id: 'ytd',
    label: 'Year to date',
    range: (t: IsoDate): DateRange => ({
      start: '2026-01-01',
      end: t,
    }),
  },
]

export const Q3: DateRange = {
  start: '2026-07-01',
  end: '2026-09-30',
}

export const minutesBetween = (a: string, b: string) =>
  Math.round(
    (Date.parse(`${b}Z`) - Date.parse(`${a}Z`)) / 60000,
  )

export const lasting = (m: number) =>
  m >= 60
    ? `${Math.floor(m / 60)} h` +
      (m % 60 ? ` ${m % 60} min` : '')
    : `${m} min`

export const SLOTS: IsoTime[] = [
  '09:00',
  '09:30',
  '11:00',
  '14:00',
  '15:30',
  '16:00',
]

export const MIN_SEC = ['m', 's'] as const

export const DAY_HOUR = ['d', 'h'] as const

export const booked = (d: IsoDate) =>
  isWeekend(d) ||
  ['2026-11-11', '2026-11-12', '2026-11-26'].includes(d)

export const usd = (n: number) =>
  `$${n.toLocaleString('en-US')}`

/** The Monday of an ISO week: the week with the
 * year's first Thursday is week 1. */
export function mondayOf(week: string) {
  const [year, n] = [+week.slice(0, 4), +week.slice(6)]
  const jan4 = new Date(Date.UTC(year, 0, 4))
  return new Date(
    jan4.getTime() +
      ((n - 1) * 7 - ((jan4.getUTCDay() + 6) % 7)) *
        86400000,
  )
}

export const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri']

export const HOURS = [7.5, 8, 6, 8.5, 4]

export const REVENUE: Record<string, number> = {
  '2026': 412300,
  '2026-Q1': 96400,
  '2026-Q2': 101800,
  '2026-Q3': 104900,
  '2026-Q4': 109200,
  '2026-10': 36100,
  '2026-09': 35200,
}

export const DAILY_WEEKLY = ['DAILY', 'WEEKLY'] as const
