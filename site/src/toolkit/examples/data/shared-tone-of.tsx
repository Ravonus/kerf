import type {
  KanbanCardData,
  KanbanColumn,
  PivotMeasure,
} from '@kerf/veneer'

import {
  DEPLOYS,
  PEOPLE,
  PROJECTS,
  TONE_OF,
} from '../../world'

import type { Status } from '../../world'

import {
  type Project,
  money,
  type Person,
} from './shared-project'

/* -- Feed -- */

export const toneOf = (status: string) =>
  TONE_OF[status as Status]

export const verb: Record<string, string> = {
  Live: 'shipped',
  Building: 'started',
  Failed: 'broke',
}

export const hoursAgo = (i: number) =>
  i < 24 ? `${i + 1}h` : `${Math.floor(i / 24)}d`

export const ACTIVITY = Array.from(
  { length: 300 },
  (_, i) => {
    const d = DEPLOYS[i % 6]!
    return {
      id: i,
      what: `${d.author} ${verb[d.status]} ${d.project}`,
      when: hoursAgo(i),
      detail: `${d.message}. ${d.branch} at ${d.commit}.`,
      tone: toneOf(d.status),
    }
  },
)

/* -- PivotTable -- */

export const MEASURES: PivotMeasure<Project>[] = [
  {
    id: 'cost',
    label: 'Cost',
    value: (p) => p.cost,
    format: money,
  },
  {
    id: 'deploys',
    label: 'Deploys',
    value: (p) => p.deploys,
  },
  { id: 'count', label: 'Projects', value: () => 1 },
]

export const ONE: PivotMeasure<
  (typeof QUARTERS)[number]
>[] = [
  {
    id: 'cost',
    label: 'Cost',
    value: (q) => q.cost,
    format: money,
  },
]

export const QUARTERS = PROJECTS.slice(0, 6).flatMap(
  (p) =>
    ['Q1', 'Q2', 'Q3', 'Q4'].map((quarter, n) => ({
      project: p.name,
      quarter,
      cost: Math.round(p.cost * (0.8 + n * 0.11)),
    })),
)

export const HEADS: PivotMeasure<Person>[] = [
  { id: 'people', label: 'People', value: () => 1 },
]

/* -- Kanban -- */

export const initials = (name: string) =>
  PEOPLE.find((p) => p.name.startsWith(name))?.initials

export const card = (
  id: string,
  title: string,
  tag: {
    label: string
    color: number
    who: string
    meta?: string
  },
): KanbanCardData => {
  const { label, color, who, meta } = tag
  return {
    id,
    title,
    label,
    color,
    assignee: initials(who),
    meta,
  }
}

export const BOARD: KanbanColumn[] = [
  {
    id: 'todo',
    title: 'To do',
    color: 8,
    cards: [
      card('t1', 'Rotate the edge cache keys', {
        label: 'Ops',
        color: 2,
        who: 'Jun',
        meta: 'Nov 4',
      }),
      card('t2', 'Add Apple Pay to the receipts', {
        label: 'Web',
        color: 1,
        who: 'Tomás',
        meta: 'Nov 6',
      }),
      card('t3', 'Write the ranking rollout notes', {
        label: 'Docs',
        color: 5,
        who: 'Lena',
      }),
    ],
  },
  {
    id: 'doing',
    title: 'In progress',
    color: 1,
    limit: 3,
    cards: [
      card('t4', 'Retry timed out upstream calls', {
        label: 'Mobile',
        color: 3,
        who: 'Sam',
        meta: 'Nov 2',
      }),
      card('t5', 'Rank exact matches first', {
        label: 'Search',
        color: 4,
        who: 'Lena',
        meta: 'Nov 3',
      }),
    ],
  },
  {
    id: 'review',
    title: 'In review',
    color: 4,
    cards: [
      card('t6', 'Prorate seats on plan change', {
        label: 'Billing',
        color: 6,
        who: 'Mara',
      }),
    ],
  },
  {
    id: 'done',
    title: 'Done',
    color: 7,
    cards: [
      card('t7', 'Cache product images at the edge', {
        label: 'Web',
        color: 1,
        who: 'Priya',
      }),
      card('t8', 'Lower the stale window to 30s', {
        label: 'Ops',
        color: 2,
        who: 'Jun',
      }),
    ],
  },
]

export const OVER: KanbanColumn[] = [
  {
    id: 'todo',
    title: 'To do',
    color: 8,
    cards: [
      card('o1', 'Rotate the edge cache keys', {
        label: 'Ops',
        color: 2,
        who: 'Jun',
      }),
    ],
  },
  {
    id: 'doing',
    title: 'In progress',
    color: 1,
    limit: 2,
    cards: [
      card('o2', 'Retry timed out upstream calls', {
        label: 'Mobile',
        color: 3,
        who: 'Sam',
      }),
      card('o3', 'Rank exact matches first', {
        label: 'Search',
        color: 4,
        who: 'Lena',
      }),
      card('o4', 'Prorate seats on plan change', {
        label: 'Billing',
        color: 6,
        who: 'Mara',
      }),
    ],
  },
]

export const SPRINT: KanbanColumn[] = [
  'Backlog',
  'Next',
  'Doing',
].map((title, c) => ({
  id: title,
  title,
  color: c + 1,
  cards: Array.from({ length: 2000 }, (_, i) => ({
    id: `${title}-${i}`,
    title: `${DEPLOYS[(i + c) % 6]!.message} (${i + 1})`,
    meta: DEPLOYS[(i + c) % 6]!.project,
  })),
}))
