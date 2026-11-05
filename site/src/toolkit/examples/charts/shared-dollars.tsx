import { TRAFFIC } from '../../world'

export const dollars = (v: number) =>
  `$${v.toLocaleString('en-US')}`

export const thousands = (v: number) =>
  `$${(v / 1000).toFixed(1)}k`

export const millions = (v: number) => `${v}M`

export const ms = (v: number) => `${Math.round(v)} ms`

export const TEAMS = [
  { key: 'platform', name: 'Platform' },
  { key: 'web', name: 'Web' },
  { key: 'data', name: 'Data' },
  { key: 'mobile', name: 'Mobile' },
]

export const SERVICES = [
  { key: 'compute', name: 'Compute' },
  { key: 'storage', name: 'Storage' },
  { key: 'database', name: 'Database' },
  { key: 'network', name: 'Network' },
]

export const REGION_LINES = [
  { key: 'euWest', name: 'eu-west' },
  { key: 'usEast', name: 'us-east' },
  { key: 'apSouth', name: 'ap-south' },
]

export const COST_LINE = [
  { key: 'cost', name: 'Monthly bill' },
]

export const RANGES = [
  { value: '6', label: '6 months' },
  { value: '12', label: '12 months' },
]

export const LAUNCH = [
  { x: 'Jul', label: 'Edge cache launch' },
]

export const TARGET = [{ y: 36, label: 'Capacity plan' }]

export const TICKS = [100, 160, 220]

export const GOAL_LINE = { y: 160, label: 'Target 160' }

export const seed = Array.from({ length: 60 }, (_, i) =>
  Math.round(52 + Math.sin(i / 5) * 14 + (i % 4)),
)

export const SPIKE = { y: 75, label: 'Limit 75' }

export const STREAM_TICKS = [20, 40, 60, 80]

export const PULSES = [
  {
    name: 'Requests',
    value: '86.1M',
    values: TRAFFIC.map((t) => t.requests),
    format: millions,
  },
  {
    name: 'Deploys',
    value: '167',
    values: TRAFFIC.map((t) => t.deploys),
  },
  {
    name: 'Bill',
    value: '$8,930',
    values: TRAFFIC.map((t) => t.cost),
    format: dollars,
  },
]

export const ERRORS = TRAFFIC.map((t) => t.errors)

export const percent = (v: number) => `${v}%`

export const DEPLOYS = TRAFFIC.map((t) => t.deploys)

/** A made-up week of p95 latency per project,
 * steady enough to read as a trend. */
export const WEEK = (base: number, drift: number) =>
  Array.from({ length: 14 }, (_, i) =>
    Math.round(
      base +
        drift * i +
        Math.sin(i * 1.7 + base) * base * 0.08,
    ),
  )

export const SERVICES_WEEK = [
  {
    name: 'storefront',
    now: 84,
    values: WEEK(90, -0.6),
    trend: 'falling',
  },
  {
    name: 'checkout',
    now: 112,
    values: WEEK(108, 0.4),
    trend: 'steady',
  },
  {
    name: 'search-api',
    now: 146,
    values: WEEK(118, 2.2),
    trend: 'rising',
  },
  {
    name: 'mobile-bff',
    now: 208,
    values: WEEK(160, 3.6),
    trend: 'rising fast',
  },
]
