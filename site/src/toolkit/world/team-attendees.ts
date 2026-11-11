import type { Attendee } from '@kerf/veneer-core'
import { TEAM_ZONE } from './team-calendar'

export const TEAM_ROOM: Attendee[] = [
  {
    id: 'mara',
    name: 'Mara Lindqvist',
    organizer: true,
    zone: TEAM_ZONE,
    busy: [
      [540, 555],
      [600, 660],
      [780, 825],
    ],
  },
  {
    id: 'jun',
    name: 'Jun Tanaka',
    zone: 'Asia/Tokyo',
    hours: [540, 1080],
    busy: [
      [540, 555],
      [780, 825],
    ],
  },
  {
    id: 'priya',
    name: 'Priya Raman',
    zone: 'Asia/Kolkata',
    hours: [540, 1080],
    busy: [
      [600, 660],
      [870, 930],
    ],
  },
  {
    id: 'sam',
    name: 'Sam Okafor',
    zone: 'Africa/Lagos',
    hours: [540, 1080],
    busy: [
      [690, 750],
      [780, 825],
    ],
  },
]

export const TEAM_MORE: Attendee[] = [
  {
    id: 'lena',
    name: 'Lena Fischer',
    zone: 'Europe/Berlin',
    busy: [[900, 960]],
  },
  {
    id: 'tomas',
    name: 'Tomás Oliveira',
    zone: 'Europe/Lisbon',
    busy: [[600, 660]],
  },
]
