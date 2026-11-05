export type Status = 'Live' | 'Building' | 'Failed' | 'Paused'

export const PROJECTS: {
  id: string
  name: string
  owner: string
  region: string
  status: Status
  deploys: number
  uptime: number
  latency: number
  cost: number
  updated: string
}[] = [
  {
    id: 'storefront',
    name: 'storefront',
    owner: 'Priya Raman',
    region: 'eu-west',
    status: 'Live',
    deploys: 412,
    uptime: 99.98,
    latency: 84,
    cost: 1240,
    updated: '2026-10-31',
  },
  {
    id: 'checkout',
    name: 'checkout',
    owner: 'Tomás Oliveira',
    region: 'eu-west',
    status: 'Live',
    deploys: 288,
    uptime: 99.95,
    latency: 112,
    cost: 980,
    updated: '2026-10-31',
  },
  {
    id: 'search-api',
    name: 'search-api',
    owner: 'Lena Fischer',
    region: 'us-east',
    status: 'Building',
    deploys: 196,
    uptime: 99.91,
    latency: 146,
    cost: 1610,
    updated: '2026-10-30',
  },
  {
    id: 'billing',
    name: 'billing',
    owner: 'Mara Lindqvist',
    region: 'us-east',
    status: 'Live',
    deploys: 154,
    uptime: 99.99,
    latency: 73,
    cost: 720,
    updated: '2026-10-29',
  },
  {
    id: 'mobile-bff',
    name: 'mobile-bff',
    owner: 'Sam Okafor',
    region: 'ap-south',
    status: 'Failed',
    deploys: 233,
    uptime: 99.42,
    latency: 208,
    cost: 860,
    updated: '2026-10-29',
  },
  {
    id: 'notifier',
    name: 'notifier',
    owner: 'Jun Tanaka',
    region: 'eu-north',
    status: 'Live',
    deploys: 97,
    uptime: 99.97,
    latency: 58,
    cost: 310,
    updated: '2026-10-27',
  },
  {
    id: 'reports',
    name: 'reports',
    owner: 'Noor Haddad',
    region: 'us-west',
    status: 'Paused',
    deploys: 41,
    uptime: 99.8,
    latency: 321,
    cost: 190,
    updated: '2026-10-22',
  },
  {
    id: 'edge-cache',
    name: 'edge-cache',
    owner: 'Jun Tanaka',
    region: 'global',
    status: 'Live',
    deploys: 318,
    uptime: 100,
    latency: 21,
    cost: 1430,
    updated: '2026-10-31',
  },
  {
    id: 'auth',
    name: 'auth',
    owner: 'Mara Lindqvist',
    region: 'eu-west',
    status: 'Live',
    deploys: 176,
    uptime: 99.99,
    latency: 66,
    cost: 540,
    updated: '2026-10-28',
  },
  {
    id: 'ingest',
    name: 'ingest',
    owner: 'Lena Fischer',
    region: 'us-east',
    status: 'Live',
    deploys: 264,
    uptime: 99.93,
    latency: 131,
    cost: 2120,
    updated: '2026-10-30',
  },
]

export const TONE_OF: Record<Status, 'positive' | 'info' | 'critical' | 'neutral'> = {
  Live: 'positive',
  Building: 'info',
  Failed: 'critical',
  Paused: 'neutral',
}
