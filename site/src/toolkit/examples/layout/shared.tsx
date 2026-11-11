import type { IconName, ShellProps } from '@kerf/veneer'
import { PEOPLE, PROJECTS, TRAFFIC } from '../../world'

export const BOX =
  'display:grid;align-content:center;' +
  'gap:2px;' +
  'padding:var(--veneer-space-related);' +
  'border:var(--veneer-border-hairline) ' +
  'solid var(--veneer-color-border);' +
  'border-radius:' +
  'var(--veneer-radius-surface);' +
  'background:var(--veneer-color-surface);' +
  'color:var(--veneer-color-text);' +
  'font-size:var(--veneer-text-caption-size);' +
  'min-inline-size:0'

export const projectOf = (c: unknown) => {
  const n = Number(typeof c === 'function' ? c() : c)
  return Number.isInteger(n) && n > 0
    ? PROJECTS[(n - 1) % PROJECTS.length]
    : undefined
}

export function Box({
  tall,
  children,
  ...rest
}: {
  tall?: number
  children?: unknown
  [attr: string]: unknown
}) {
  return (
    <div
      style={
        tall ? `${BOX};min-block-size:${tall}px` : BOX
      }
      {...rest}
    >
      {projectOf(children) ? (
        <>
          <strong>{projectOf(children)!.name}</strong>
          <span
            style={'color:var(--veneer-color-text-subtle)'}
          >
            {projectOf(children)!.region}
          </span>
        </>
      ) : (
        children
      )}
    </div>
  )
}

export const EIGHT = [1, 2, 3, 4, 5, 6, 7, 8]

export const SIX = [1, 2, 3, 4, 5, 6]

export const FOUR = [1, 2, 3, 4]

export type Gap =
  | 'none'
  | 'hair'
  | 'tight'
  | 'related'
  | 'group'
  | 'section'
  | 'page'

export const MINS = ['xs', 'sm', 'md', 'lg'] as const

export const COLS = [2, 3, 4] as const

export const GAPS = [
  'tight',
  'related',
  'group',
  'section',
] as const

export const now = TRAFFIC[11]!,
  before = TRAFFIC[10]!

export const change = (a: number, b: number) => {
  const sign = a >= b ? '+' : ''
  const percent = (((a - b) / b) * 100).toFixed(1)
  return `${sign}${percent}%`
}

export const STATS = [
  {
    label: 'Requests',
    value: `${now.requests}M`,
    delta: change(now.requests, before.requests),
    good: true,
  },
  {
    label: 'Error rate',
    value: `${now.errors}%`,
    delta: change(now.errors, before.errors),
    good: true,
  },
  {
    label: 'Deploys',
    value: String(now.deploys),
    delta: change(now.deploys, before.deploys),
    good: true,
  },
  {
    label: 'Spend',
    value: `$${now.cost.toLocaleString('en-US')}`,
    delta: change(now.cost, before.cost),
    good: false,
  },
]

export const STACK_GAPS = [
  'hair',
  'tight',
  'related',
  'group',
  'section',
] as const

export const ALIGNS = ['start', 'center', 'end'] as const

export const JUSTIFIES = [
  'start',
  'center',
  'end',
  'between',
] as const

export const TAGS = [
  'eu-west',
  'us-east',
  'ap-south',
  'us-west',
  'eu-north',
  'global',
  'staging',
  'preview',
  'canary',
  'archive',
]

export const WIDTHS = [
  'rail',
  'nav',
  'list',
  'half',
] as const

export const SECTIONS = [
  'General',
  'Domains',
  'Team',
  'Billing',
]

export const MAXES = [
  'narrow',
  'measure',
  'content',
] as const

export const SCREEN =
  '--veneer-viewport-block:360px;' +
  'border:var(--veneer-border-hairline) ' +
  'solid var(--veneer-color-border);' +
  'border-radius:' +
  'var(--veneer-radius-surface);' +
  'padding-inline:var(--veneer-space-group)'

export const FILL =
  'block-size:280px;' +
  'border:var(--veneer-border-hairline) ' +
  'solid var(--veneer-color-border);' +
  'border-radius:' +
  'var(--veneer-radius-surface);' +
  'padding-inline:var(--veneer-space-group)'

export const RATIOS = [
  '21:9',
  '16:9',
  '3:2',
  '4:3',
  'square',
  '3:4',
] as const

export const art = (a: string, b: string) => (
  <svg
    viewBox="0 0 320 180"
    preserveAspectRatio="xMidYMid slice"
    aria-hidden="true"
  >
    <rect
      width="320"
      height="180"
      fill={`var(--veneer-color-data-${a})`}
    />
    <circle
      cx="96"
      cy="150"
      r="130"
      fill={`var(--veneer-color-data-${b})`}
    />
    <rect
      x="176"
      y="36"
      width="104"
      height="108"
      rx="8"
      fill="var(--veneer-color-surface)"
      opacity="0.85"
    />
  </svg>
)

export const LOG = [
  '16:42:01  Cloning 9f3ac21',
  '16:42:09  Installing dependencies',
  '16:42:48  Building storefront',
  '16:44:03  Live in eu-west',
]

export const VIEWS = [
  { value: 'all', label: 'All' },
  { value: 'mine', label: 'Mine' },
  { value: 'failed', label: 'Failed' },
]

export function AppWindow({
  height,
  wide,
  children,
}: {
  height: number
  wide?: number
  children?: unknown
}) {
  const box = () =>
    `--veneer-viewport-block:${height}px;` +
    `block-size:${height}px;` +
    (wide
      ? `inline-size:min(100%,${wide}px);` +
        'margin-inline:auto;'
      : '') +
    'overflow:auto;contain:layout paint;' +
    'border:var(--veneer-border-hairline) solid ' +
    'var(--veneer-color-border);' +
    'border-radius:var(--veneer-radius-surface)'
  return <div style={box()}>{children}</div>
}

export const MARK = () => (
  <svg
    viewBox="0 0 24 24"
    aria-hidden="true"
  >
    <rect
      x="3"
      y="3"
      width="8"
      height="8"
      rx="2"
      fill="var(--veneer-color-accent-solid)"
    />
    <rect
      x="13"
      y="13"
      width="8"
      height="8"
      rx="2"
      fill="var(--veneer-color-accent-solid)"
    />
  </svg>
)

export const ME = PEOPLE[0]!

export const ACCOUNT: ShellProps['account'] = {
  name: ME.name,
  email: ME.email,
  initials: ME.initials,
  items: [
    { label: 'Profile', icon: 'user' },
    { label: 'Preferences', icon: 'settings' },
    'separator',
    {
      label: 'Sign out',
      icon: 'log-out',
      tone: 'critical',
    },
  ],
}

export function kerfNav(go: (id: string) => void) {
  const item = (
    id: string,
    label: string,
    { icon, count }: { icon: IconName; count?: number },
  ) => ({
    id,
    label,
    icon,
    count,
    onSelect: () => go(id),
  })
  return [
    {
      label: 'Workspace',
      items: [
        item('projects', 'Projects', { icon: 'layers' }),
        item('deploys', 'Deploys', {
          icon: 'rocket',
          count: 2,
        }),
        item('activity', 'Activity', {
          icon: 'activity',
        }),
        item('team', 'Team', { icon: 'users' }),
        item('billing', 'Billing', { icon: 'folder' }),
      ],
    },
    {
      label: 'Saved views',
      items: [
        item('failed', 'Failed builds', {
          icon: 'filter',
          count: 1,
        }),
      ],
    },
  ]
}

export const pageOf: Record<string, string> = {
  projects: 'Projects',
  deploys: 'Deploys',
  activity: 'Activity',
  team: 'Team',
  billing: 'Billing',
  failed: 'Failed builds',
  settings: 'Settings',
}

export const ROOT_NAV = kerfNav(() => {})

export const FOCUS_STEPS = [
  'Connect a repository',
  'Choose a region',
  'Check your settings',
]
