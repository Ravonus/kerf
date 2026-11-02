// One small product behind every example: Tessel, a deploy tool. The same people, projects and numbers everywhere, so a
// table, a chart and a feed read as one app. Dates are fixed so server and client always agree.
export const PEOPLE = [
  { id: 'mara', name: 'Mara Lindqvist', email: 'mara@tessel.dev', role: 'Owner', team: 'Platform', initials: 'ML' },
  { id: 'jun', name: 'Jun Tanaka', email: 'jun@tessel.dev', role: 'Admin', team: 'Platform', initials: 'JT' },
  { id: 'priya', name: 'Priya Raman', email: 'priya@tessel.dev', role: 'Member', team: 'Web', initials: 'PR' },
  { id: 'tomas', name: 'Tomás Oliveira', email: 'tomas@tessel.dev', role: 'Member', team: 'Web', initials: 'TO' },
  { id: 'lena', name: 'Lena Fischer', email: 'lena@tessel.dev', role: 'Member', team: 'Data', initials: 'LF' },
  { id: 'noor', name: 'Noor Haddad', email: 'noor@tessel.dev', role: 'Viewer', team: 'Data', initials: 'NH' },
  { id: 'sam', name: 'Sam Okafor', email: 'sam@tessel.dev', role: 'Member', team: 'Mobile', initials: 'SO' },
  { id: 'ines', name: 'Inés Vidal', email: 'ines@tessel.dev', role: 'Viewer', team: 'Mobile', initials: 'IV' },
]

export type Status = 'Live' | 'Building' | 'Failed' | 'Paused'

export const PROJECTS: { id: string; name: string; owner: string; region: string; status: Status; deploys: number; uptime: number; latency: number; cost: number; updated: string }[] = [
  { id: 'storefront', name: 'storefront', owner: 'Priya Raman', region: 'eu-west', status: 'Live', deploys: 412, uptime: 99.98, latency: 84, cost: 1240, updated: '2026-10-31' },
  { id: 'checkout', name: 'checkout', owner: 'Tomás Oliveira', region: 'eu-west', status: 'Live', deploys: 288, uptime: 99.95, latency: 112, cost: 980, updated: '2026-10-31' },
  { id: 'search-api', name: 'search-api', owner: 'Lena Fischer', region: 'us-east', status: 'Building', deploys: 196, uptime: 99.91, latency: 146, cost: 1610, updated: '2026-10-30' },
  { id: 'billing', name: 'billing', owner: 'Mara Lindqvist', region: 'us-east', status: 'Live', deploys: 154, uptime: 99.99, latency: 73, cost: 720, updated: '2026-10-29' },
  { id: 'mobile-bff', name: 'mobile-bff', owner: 'Sam Okafor', region: 'ap-south', status: 'Failed', deploys: 233, uptime: 99.42, latency: 208, cost: 860, updated: '2026-10-29' },
  { id: 'notifier', name: 'notifier', owner: 'Jun Tanaka', region: 'eu-north', status: 'Live', deploys: 97, uptime: 99.97, latency: 58, cost: 310, updated: '2026-10-27' },
  { id: 'reports', name: 'reports', owner: 'Noor Haddad', region: 'us-west', status: 'Paused', deploys: 41, uptime: 99.8, latency: 321, cost: 190, updated: '2026-10-22' },
  { id: 'edge-cache', name: 'edge-cache', owner: 'Jun Tanaka', region: 'global', status: 'Live', deploys: 318, uptime: 100, latency: 21, cost: 1430, updated: '2026-10-31' },
  { id: 'auth', name: 'auth', owner: 'Mara Lindqvist', region: 'eu-west', status: 'Live', deploys: 176, uptime: 99.99, latency: 66, cost: 540, updated: '2026-10-28' },
  { id: 'ingest', name: 'ingest', owner: 'Lena Fischer', region: 'us-east', status: 'Live', deploys: 264, uptime: 99.93, latency: 131, cost: 2120, updated: '2026-10-30' },
]

export const TONE_OF: Record<Status, 'positive' | 'info' | 'critical' | 'neutral'> = { Live: 'positive', Building: 'info', Failed: 'critical', Paused: 'neutral' }

export const DEPLOYS = [
  { id: 'd-4821', project: 'storefront', branch: 'main', commit: '9f3ac21', message: 'Cache product images at the edge', author: 'Priya Raman', status: 'Live', minutes: 2, at: '2026-10-31T16:42' },
  { id: 'd-4820', project: 'search-api', branch: 'ranking-v2', commit: '1be07d4', message: 'Rank exact matches first', author: 'Lena Fischer', status: 'Building', minutes: 6, at: '2026-10-31T16:10' },
  { id: 'd-4819', project: 'mobile-bff', branch: 'main', commit: 'c44e190', message: 'Retry timed out upstream calls', author: 'Sam Okafor', status: 'Failed', minutes: 4, at: '2026-10-31T15:27' },
  { id: 'd-4818', project: 'checkout', branch: 'main', commit: '70d2fa8', message: 'Add Apple Pay to the last step', author: 'Tomás Oliveira', status: 'Live', minutes: 3, at: '2026-10-31T14:03' },
  { id: 'd-4817', project: 'edge-cache', branch: 'main', commit: 'e81b6c2', message: 'Lower the stale window to 30s', author: 'Jun Tanaka', status: 'Live', minutes: 1, at: '2026-10-31T11:55' },
  { id: 'd-4816', project: 'billing', branch: 'main', commit: '2ad9e03', message: 'Prorate seats on plan change', author: 'Mara Lindqvist', status: 'Live', minutes: 3, at: '2026-10-29T17:20' },
]

/** Twelve months of the numbers the charts draw. */
export const MONTHS = ['Nov', 'Dec', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct']
export const TRAFFIC = [
  { month: 'Nov', requests: 41.2, errors: 0.42, deploys: 88, cost: 6120 },
  { month: 'Dec', requests: 52.8, errors: 0.51, deploys: 74, cost: 6480 },
  { month: 'Jan', requests: 47.1, errors: 0.38, deploys: 96, cost: 6390 },
  { month: 'Feb', requests: 49.6, errors: 0.33, deploys: 104, cost: 6710 },
  { month: 'Mar', requests: 58.3, errors: 0.47, deploys: 118, cost: 7240 },
  { month: 'Apr', requests: 61.9, errors: 0.29, deploys: 126, cost: 7380 },
  { month: 'May', requests: 66.4, errors: 0.31, deploys: 131, cost: 7690 },
  { month: 'Jun', requests: 64.2, errors: 0.44, deploys: 122, cost: 7620 },
  { month: 'Jul', requests: 71.5, errors: 0.27, deploys: 139, cost: 8010 },
  { month: 'Aug', requests: 74.8, errors: 0.25, deploys: 144, cost: 8230 },
  { month: 'Sep', requests: 79.3, errors: 0.36, deploys: 152, cost: 8560 },
  { month: 'Oct', requests: 86.1, errors: 0.22, deploys: 167, cost: 8930 },
]

export const REGIONS = [
  { region: 'eu-west', requests: 34.2, share: 40 },
  { region: 'us-east', requests: 24.8, share: 29 },
  { region: 'ap-south', requests: 12.1, share: 14 },
  { region: 'us-west', requests: 9.4, share: 11 },
  { region: 'eu-north', requests: 5.6, share: 6 },
]

export const INVOICES = [
  { id: 'INV-2026-10', date: '2026-10-01', amount: 8560, status: 'Paid' },
  { id: 'INV-2026-09', date: '2026-09-01', amount: 8230, status: 'Paid' },
  { id: 'INV-2026-08', date: '2026-08-01', amount: 8010, status: 'Paid' },
  { id: 'INV-2026-07', date: '2026-07-01', amount: 7620, status: 'Paid' },
]
