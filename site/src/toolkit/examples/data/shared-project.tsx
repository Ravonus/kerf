import { Badge, Row, Stack, Text } from '@weft-js/warp'

import type { Column } from '@weft-js/warp'

import { type DEPLOYS, type PEOPLE, PROJECTS, TONE_OF, type Status } from '../../world'

export type Project = (typeof PROJECTS)[number]

export type Density = 'compact' | 'cozy' | 'comfortable'

export const money = (n: number) => `$${n.toLocaleString('en-US')}`

export const badge = (p: { status: string }) => (
  <Badge tone={TONE_OF[p.status as Status]} dot>
    {p.status}
  </Badge>
)

export const COLUMNS: Column<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, sort: true, card: 'title' },
  { id: 'status', header: 'Status', sort: true, card: 'badge', cell: badge },
  { id: 'owner', header: 'Owner', sort: true },
  { id: 'region', header: 'Region', sort: true },
  { id: 'deploys', header: 'Deploys', numeric: true, sort: true },
  { id: 'cost', header: 'Cost', numeric: true, sort: true, cell: (p) => money(p.cost) },
]

export const FIVE = { size: 5 }

export const details = (p: Project) => (
  <Row gap="section">
    <Stack gap="hair">
      <Text role="label" subtle>
        Uptime
      </Text>
      <Text>{p.uptime}%</Text>
    </Stack>
    <Stack gap="hair">
      <Text role="label" subtle>
        Latency
      </Text>
      <Text>{p.latency} ms</Text>
    </Stack>
    <Stack gap="hair">
      <Text role="label" subtle>
        Updated
      </Text>
      <Text>{p.updated}</Text>
    </Stack>
  </Row>
)

export const RANKED: Column<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, card: 'title' },
  { id: 'status', header: 'Status', card: 'badge', cell: badge },
  { id: 'owner', header: 'Owner', priority: 2 },
  { id: 'region', header: 'Region', priority: 2 },
  { id: 'latency', header: 'Latency', numeric: true, priority: 3 },
  { id: 'uptime', header: 'Uptime', numeric: true, priority: 3 },
]

export const WIDE: Column<Project>[] = [
  { id: 'name', header: 'Project', rowHeader: true, pin: true, resize: true },
  { id: 'status', header: 'Status', resize: true, cell: badge },
  { id: 'owner', header: 'Owner', resize: true },
  { id: 'region', header: 'Region' },
  { id: 'deploys', header: 'Deploys', numeric: true },
  { id: 'uptime', header: 'Uptime', numeric: true },
  { id: 'latency', header: 'Latency', numeric: true },
  { id: 'cost', header: 'Cost', numeric: true, cell: (p) => money(p.cost) },
  { id: 'updated', header: 'Updated' },
]

export const PRICED: Column<Project>[] = [
  {
    id: 'name',
    header: 'Project',
    rowHeader: true,
    edit: true,
    validate: (v) => String(v).trim() !== '' || 'A project needs a name',
  },
  { id: 'owner', header: 'Owner', edit: true },
  {
    id: 'cost',
    header: 'Budget',
    numeric: true,
    cell: (p) => money(p.cost),
    edit: (text) => Number(text.replace(/[$,]/g, '')),
    validate: (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0) || 'Enter an amount',
  },
]

export const WATCHED = PROJECTS.slice(0, 5)

export const NONE: Project[] = []

export type Deploy = (typeof DEPLOYS)[number]

export const DEPLOY_COLUMNS: Column<Deploy>[] = [
  { id: 'message', header: 'Change', rowHeader: true, card: 'title' },
  { id: 'status', header: 'Status', sort: true, card: 'badge', cell: badge },
  { id: 'project', header: 'Project', sort: true },
  { id: 'author', header: 'Author', sort: true, priority: 2 },
  {
    id: 'commit',
    header: 'Commit',
    priority: 2,
    cell: (d) => (
      <Text inline role="code">
        {d.commit}
      </Text>
    ),
  },
  { id: 'at', header: 'When', sort: true, value: (d) => d.at.replace('T', ' ') },
]

export type Person = (typeof PEOPLE)[number]

export const TEAM_COLUMNS: Column<Person>[] = [
  { id: 'name', header: 'Name', rowHeader: true, sort: true, card: 'title' },
  { id: 'email', header: 'Email', card: 'hide' },
  { id: 'team', header: 'Team', sort: true },
  {
    id: 'role',
    header: 'Role',
    sort: true,
    card: 'badge',
    cell: (p) => <Badge tone={p.role === 'Owner' ? 'accent' : 'neutral'}>{p.role}</Badge>,
  },
]
