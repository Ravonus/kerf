import type {
  IntegrityStats,
  IntegrityEvent,
} from '@kerf-js/veneer'

export const INTEGRITY_STATS: IntegrityStats = {
  sent: 42,
  received: 41,
  duplicate: 1,
  outOfOrder: 0,
  lagP95: 54,
}

export const INTEGRITY_EVENTS: IntegrityEvent[] = [
  {
    id: 'e3',
    seq: 42,
    kind: 'status',
    route: 'Jun → you',
    lag: 31,
  },
  {
    id: 'e2',
    seq: 41,
    kind: 'title',
    route: 'Jun → you',
    note: 'duplicate, ignored',
    lag: 54,
  },
  {
    id: 'e1',
    seq: 41,
    kind: 'title',
    route: 'Jun → you',
    lag: 28,
  },
]
