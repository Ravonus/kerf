import type { ActivityItem } from '@kerf/veneer'

export const ACTIVITY: ActivityItem[] = [
  {
    id: 'a1',
    actor: 'Priya Raman',
    verb: 'deployed',
    object: 'storefront',
    detail: 'to eu-west',
    time: '16:42',
    day: 'Today',
  },
  {
    id: 'a2',
    actor: 'Lena Fischer',
    verb: 'started a build of',
    object: 'search-api',
    time: '16:10',
    day: 'Today',
  },
  {
    id: 'a3',
    actor: 'Sam Okafor',
    verb: 'rolled back',
    object: 'mobile-bff',
    detail: 'to d-4801',
    time: '15:41',
    day: 'Today',
  },
  {
    id: 'a4',
    actor: 'Tomás Oliveira',
    verb: 'deployed',
    object: 'checkout',
    time: '14:03',
    day: 'Today',
  },
  {
    id: 'a5',
    actor: 'Mara Lindqvist',
    verb: 'changed the plan for',
    object: 'billing',
    time: '17:20',
    day: 'Yesterday',
  },
  {
    id: 'a6',
    actor: 'Jun Tanaka',
    verb: 'paused',
    object: 'reports',
    time: '11:02',
    day: 'Yesterday',
  },
]
