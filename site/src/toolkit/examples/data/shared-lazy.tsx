import { Row, Stack, Text } from '@weft-js/warp'

import type { GridTree } from '@weft-js/warp'

import { DEPLOYS, PROJECTS } from '../../world'

import { type Project, money, details } from './shared-project'

import { GRID, type Spend, SPEND } from './shared-statuses'

export const LAZY: Spend[] = SPEND.map((t) => ({
  ...t,
  kids: undefined,
  hasChildren: true,
  deploys: t.kids!.reduce((n, k) => n + k.deploys, 0),
  cost: t.kids!.reduce((n, k) => n + k.cost, 0),
}))

export const LOAD: GridTree<Spend> = {
  branch: (row) => !!row.hasChildren,
  load: async (row) => {
    await new Promise((done) => {
      setTimeout(done, 700)
    })
    return SPEND.find((t) => t.id === row.id)?.kids ?? []
  },
}

/** Deploys moves under the row, with the other numbers: the grid keeps room for its details button. */
export const DETAIL_GRID = GRID.filter((c) => c.id !== 'deploys')

export const gridDetails = (p: Project) => (
  <Row gap="section">
    <Stack gap="hair">
      <Text role="label" subtle>
        Deploys
      </Text>
      <Text>{p.deploys}</Text>
    </Stack>
    {details(p)}
  </Row>
)

export const FOUR = { size: 4 }

/* -- ScrollGrid -- */

export const HOURS = Array.from({ length: 24 }, (_, h) => ({
  id: String(h),
  header: `${String(h).padStart(2, '0')}:00`,
}))

export const latency = (r: number, h: number) => 40 + (((r + 3) * 37 + h * h * 11) % 260)

export const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
]

export const MONTH_COLUMNS = MONTH_NAMES.map((m, i) => ({ id: String(i), header: m }))

export const swing = (r: number, m: number) => (((r + 2) * 53 + (m + 1) * 29) % 41) - 14

export const showSwing = (n: number) => `${n > 0 ? '+' : n < 0 ? '−' : ''}${Math.abs(n)}%`

export const SIZED = [
  { id: 'owner', header: 'Owner', width: 170 },
  { id: 'region', header: 'Region', width: 110 },
  { id: 'status', header: 'Status', width: 96 },
  { id: 'cost', header: 'Cost', width: 96 },
]

export const fieldOf = (r: number, id: string) => {
  const p = PROJECTS[r % 10]!
  return id === 'cost' ? money(p.cost + r) : p[id as 'owner']
}

/* -- VirtualList -- */

export const WORDS = [
  'GET /checkout 200',
  'POST /deploys 201',
  'GET /search?q=shoes 200',
  'GET /health 200',
  'PUT /cache 204',
  'GET /cart 304',
  'POST /auth 401',
  'GET /reports 500',
]

export const pad = (n: number) => String(n).padStart(2, '0')

export const clock = (i: number) =>
  `${pad(16 + (Math.floor(i / 3600) % 8))}:${pad(Math.floor(i / 60) % 60)}:${pad(i % 60)}`

export const LINES = Array.from({ length: 10000 }, (_, i) => ({
  id: i,
  at: clock(i),
  text: WORDS[(i * 7) % 8],
  ms: 12 + ((i * 13) % 240),
}))

export function logLine(line: () => (typeof LINES)[number]) {
  return (
    <Row gap="related" justify="between" wrap={false}>
      <Row gap="related" wrap={false}>
        <Text inline role="code" subtle>
          {line().at}
        </Text>
        <Text inline role="code">
          {line().text}
        </Text>
      </Row>
      <Text inline role="caption" subtle>
        {line().ms} ms
      </Text>
    </Row>
  )
}

export const NOTES = Array.from({ length: 2000 }, (_, i) => {
  const d = DEPLOYS[i % 6]!
  return {
    id: i,
    who: d.author,
    text: `${d.message}. ${'Rolled out to every region after the checks passed, with the old version kept warm for an hour. '.repeat(i % 4)}`.trim(),
  }
})
