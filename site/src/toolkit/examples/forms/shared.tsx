import { Badge, Row, Stack, Text } from '@weft-js/warp'
import type { SegmentedOption } from '@weft-js/warp'
import { DEPLOYS, PEOPLE, PROJECTS, REGIONS } from '../../world'

// oxlint-disable-next-line typescript/no-explicit-any -- knob values are checked by the playground's own schema, not here
export type Knobs = any

export const Cell = (p: { name: string; children?: unknown }) => (
  <Stack gap="tight">
    <Text role="caption" subtle>
      {p.name}
    </Text>
    {p.children}
  </Stack>
)

export const SLUG = /^[a-z0-9-]+$/

export const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export const REGION_OPTIONS = REGIONS.map((r) => ({ value: r.region, label: r.region }))

export const PROJECT_OPTIONS = PROJECTS.map((p) => ({ value: p.id, label: p.name, hint: p.owner }))

export const ROLE_OPTIONS = [
  { value: 'Admin', label: 'Admin', hint: 'Manages people and billing' },
  { value: 'Member', label: 'Member', hint: 'Deploys and edits projects' },
  { value: 'Viewer', label: 'Viewer', hint: 'Reads logs and metrics' },
]

export const TARGET_OPTIONS = [
  {
    group: 'Production',
    options: [
      { value: 'eu-west', label: 'eu-west' },
      { value: 'us-east', label: 'us-east' },
    ],
  },
  {
    group: 'Preview',
    options: [
      { value: 'staging', label: 'staging' },
      { value: 'canary', label: 'canary' },
      { value: 'qa', label: 'qa', disabled: true },
    ],
  },
]

export const EVENTS = ['Deploy failed', 'Deploy finished', 'Uptime drops', 'Budget reached']

export const WINDOWS = [
  { value: 'now', label: 'Right away', hint: 'Starts within a minute.' },
  { value: 'night', label: 'Tonight', hint: "At 02:00 in the project's region." },
  { value: 'weekend', label: 'This weekend', hint: 'Saturday at 02:00.', disabled: true },
] as const

export const PLANS = [
  { value: 'hobby', label: 'Hobby', hint: 'One project, free.' },
  { value: 'team', label: 'Team', hint: '€20 a seat, unlimited projects.' },
  { value: 'scale', label: 'Scale', hint: '€60 a seat, plus private regions.' },
]

export const SEAT = { hobby: 0, team: 20, scale: 60 } as Record<string, number>

export const LATENCY = { 'eu-west': 18, 'us-east': 94, 'ap-south': 162 } as Record<string, number>

export const NEAR = Object.keys(LATENCY).map((r) => ({
  value: r,
  label: (
    <Row gap="related">
      {r}
      <Badge tone={LATENCY[r]! < 50 ? 'positive' : LATENCY[r]! < 120 ? 'caution' : 'critical'}>
        {LATENCY[r]} ms
      </Badge>
    </Row>
  ),
  hint: r === 'eu-west' ? 'Closest to you.' : undefined,
}))

export const DIGESTS = [
  { value: 'instant', label: 'As it happens', hint: 'One email for each failed deploy.' },
  { value: 'daily', label: 'Daily digest', hint: 'At 08:00, if anything failed.' },
  { value: 'off', label: 'Off', hint: 'Check the dashboard yourself.' },
]

export const gigabytes = (v: number) => `${v} GB`

export const percent = (v: number) => `${v}%`

export const COPY_COST = 42

export const PERIODS = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
]

export const VIEWS: SegmentedOption<'list' | 'grid'>[] = [
  { value: 'list', label: 'List', icon: 'list' },
  { value: 'grid', label: 'Grid', icon: 'grid' },
]

export const LOGS = [
  { value: 'all', label: 'All' },
  { value: 'info', label: 'Info' },
  { value: 'trace', label: 'Trace', disabled: true },
]

export const countOf = (status: string) => DEPLOYS.filter((d) => d.status === status).length

export const DEPLOY_FILTERS = [
  { value: 'all', label: 'All', count: DEPLOYS.length },
  { value: 'Live', label: 'Live', count: countOf('Live') },
  { value: 'Failed', label: 'Failed', count: countOf('Failed') },
]

export const PAGE_SIZES = [
  { value: '3', label: '3 rows' },
  { value: '5', label: '5 rows' },
  { value: '10', label: '10 rows' },
]

export const TEAM_ROLES = ROLE_OPTIONS.map((r) => ({ value: r.value, label: r.value }))

export const TEAM = PEOPLE.slice(1, 5)
