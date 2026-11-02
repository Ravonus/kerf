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

// -- the admin pack: Tessel's own settings, billing and shop --
import type { ApiKey, AuditEvent, BillingPlan, Integration, Invite, Invoice, Member, PaymentMethod, Role, Webhook } from '@weft/warp'

/** "Now" for anything that says how long ago, so the words never change. */
export const NOW = '2026-10-31T17:00:00Z'

export const TEAM_ROLES: Role[] = [{ value: 'owner', label: 'Owner', manages: true }, { value: 'admin', label: 'Admin', manages: true }, { value: 'member', label: 'Member' }, { value: 'viewer', label: 'Viewer' }]
export const INVITE_ROLES = TEAM_ROLES.slice(1)

const LAST_SEEN = ['Active now', '12 min ago', '1 h ago', 'Today', 'Yesterday', 'Oct 28', 'Oct 24', 'Oct 12']
export const TEAM_MEMBERS: Member[] = PEOPLE.map((p, i) => ({ id: p.id, name: p.name, email: p.email, role: p.role.toLowerCase(), lastActive: LAST_SEEN[i] }))
export const TEAM_INVITES: Invite[] = [{ id: 'dara', email: 'dara@tessel.dev', role: 'member', sent: '2 days ago' }, { id: 'kai', email: 'kai@contract.dev', role: 'viewer', sent: 'Oct 27' }]

export const TEAM_PERMISSIONS = [
  { id: 'view', label: 'See projects and deploys', roles: ['owner', 'admin', 'member', 'viewer'] },
  { id: 'deploy', label: 'Deploy to production', roles: ['owner', 'admin', 'member'] },
  { id: 'env', label: 'Change environment variables', roles: ['owner', 'admin', 'member'] },
  { id: 'invite', label: 'Invite and remove members', roles: ['owner', 'admin'] },
  { id: 'keys', label: 'Create API keys', roles: ['owner', 'admin'] },
  { id: 'billing', label: 'Change billing and plan', roles: ['owner'] },
]

export const API_KEYS: ApiKey[] = [
  { id: 'k1', name: 'CI deploys', prefix: 'tsl_test_8c2f', scopes: ['deploy'], created: 'Sep 30', lastUsed: '2026-10-31T16:42:00Z' },
  { id: 'k2', name: 'Metrics export', prefix: 'tsl_test_41ab', scopes: ['read'], created: 'Aug 2', lastUsed: '2026-10-12T10:00:00Z' },
  { id: 'k3', name: 'Staging smoke tests', prefix: 'tsl_test_e07d', scopes: ['read', 'deploy'], created: 'Jul 19', lastUsed: '2026-10-30T04:10:00Z' },
  { id: 'k4', name: 'Old Jenkins box', prefix: 'tsl_test_19c4', scopes: ['deploy'], created: 'Mar 3' },
]

export const PLANS: BillingPlan[] = [
  { id: 'hobby', name: 'Hobby', price: 0, description: 'For side projects.', features: ['3 seats', '100 deploys a month', '1 region'] },
  { id: 'team', name: 'Team', price: 24, description: 'For product teams.', features: ['10 seats', 'Unlimited deploys', '5 regions', 'Preview environments'] },
  { id: 'scale', name: 'Scale', price: 64, description: 'For many teams.', features: ['50 seats', 'Unlimited deploys', 'Every region', 'SSO and audit export'] },
]

export const BILLS: Invoice[] = [
  { id: '10', date: 'Oct 1', number: 'INV-2026-10', status: 'paid', amount: 8560, pdf: '#invoice' },
  { id: '09', date: 'Sep 1', number: 'INV-2026-09', status: 'paid', amount: 8230, pdf: '#invoice' },
  { id: '08', date: 'Aug 1', number: 'INV-2026-08', status: 'paid', amount: 8010, pdf: '#invoice' },
  { id: '07', date: 'Jul 1', number: 'INV-2026-07', status: 'paid', amount: 7620, pdf: '#invoice' },
  { id: '06', date: 'Jun 1', number: 'INV-2026-06', status: 'paid', amount: 7690, pdf: '#invoice' },
  { id: '05', date: 'May 1', number: 'INV-2026-05', status: 'paid', amount: 7380, pdf: '#invoice' },
  { id: '04', date: 'Apr 1', number: 'INV-2026-04', status: 'paid', amount: 7240, pdf: '#invoice' },
  { id: '03', date: 'Mar 1', number: 'INV-2026-03', status: 'paid', amount: 6710, pdf: '#invoice' },
]
export const OVERDUE_BILLS: Invoice[] = [{ id: '11', date: 'Nov 1', number: 'INV-2026-11', status: 'failed', amount: 8930 }, { id: '10r', date: 'Oct 1', number: 'INV-2026-10', status: 'retrying', amount: 8560 }, ...BILLS.slice(1, 4)]

export const CARDS: PaymentMethod[] = [{ id: 'visa', brand: 'Visa', last4: '4242', expires: '08/28', default: true }, { id: 'mc', brand: 'Mastercard', last4: '4444', expires: '02/27' }]

export const AUDIT: AuditEvent[] = [
  { id: 'a1', at: '2026-10-31T16:42:00Z', actor: 'Priya Raman', category: 'deploys', verb: 'deployed', target: 'storefront', href: '#deploy', ip: '84.12.3.9' },
  { id: 'a2', at: '2026-10-31T15:27:00Z', actor: 'Sam Okafor', category: 'deploys', verb: 'rolled back', target: 'mobile-bff', ip: '10.4.0.22' },
  { id: 'a3', at: '2026-10-31T13:58:00Z', actor: 'Mara Lindqvist', category: 'keys', verb: 'created API key', target: 'CI deploys', ip: '84.12.3.2' },
  { id: 'a4', at: '2026-10-31T09:12:00Z', actor: 'Jun Tanaka', category: 'members', verb: 'changed the role of', target: 'Tomás Oliveira', ip: '10.4.0.31', diff: [{ field: 'Role', from: 'Viewer', to: 'Member' }] },
  { id: 'a5', at: '2026-10-30T18:40:00Z', actor: 'Jun Tanaka', category: 'members', verb: 'invited', target: 'dara@tessel.dev', ip: '10.4.0.31' },
  { id: 'a6', at: '2026-10-29T17:20:00Z', actor: 'Mara Lindqvist', category: 'billing', verb: 'changed the plan to', target: 'Team', ip: '84.12.3.2', diff: [{ field: 'Plan', from: 'Hobby', to: 'Team' }, { field: 'Seats', from: '3', to: '10' }] },
  { id: 'a7', at: '2026-10-28T11:03:00Z', actor: 'Mara Lindqvist', category: 'keys', verb: 'revoked API key', target: 'Old laptop', ip: '84.12.3.2' },
  { id: 'a8', at: '2026-10-22T08:15:00Z', actor: 'Lena Fischer', category: 'deploys', verb: 'paused', target: 'reports', ip: '10.4.1.7' },
]
export const AUDIT_CATEGORIES = [{ value: 'all', label: 'All' }, { value: 'deploys', label: 'Deploys' }, { value: 'members', label: 'Members' }, { value: 'keys', label: 'Keys' }, { value: 'billing', label: 'Billing' }]

export const INTEGRATIONS: Integration[] = [
  { id: 'github', name: 'GitHub', summary: 'Deploy on push, status checks on pull requests.', state: 'connected', detail: 'tessel-dev · 10 repositories', can: ['Read your repositories', 'Post commit statuses'] },
  { id: 'slack', name: 'Slack', summary: 'Deploy and incident messages in a channel.', state: 'error', detail: 'Token expired Oct 26', failure: 'Messages to #deploys stopped on Oct 26.', can: ['Post to the channel you pick'] },
  { id: 'linear', name: 'Linear', summary: 'Link deploys to the issues they close.', state: 'off', can: ['Read your issues', 'Comment on issues'] },
  { id: 'datadog', name: 'Datadog', summary: 'Mark deploys on your dashboards.', state: 'off', can: ['Send events to your account'] },
  { id: 'pagerduty', name: 'PagerDuty', summary: 'Page the on-call person when a deploy fails.', state: 'off', can: ['Open incidents'] },
  { id: 'sentry', name: 'Sentry', summary: 'Tie new errors to the deploy that caused them.', state: 'connected', detail: 'tessel · 4 projects', can: ['Read releases'] },
]

export const WEBHOOKS: Webhook[] = [
  { id: 'h1', url: 'https://hooks.tessel.dev/deploys', events: ['deploy.succeeded', 'deploy.failed'], lastDelivery: '200 · 18 min ago', healthy: true },
  { id: 'h2', url: 'https://ops.tessel.dev/alerts', events: ['deploy.failed'], lastDelivery: '503 · 1 h ago', healthy: false },
]
export const WEBHOOK_EVENTS = ['deploy.succeeded', 'deploy.failed', 'deploy.rolled_back', 'member.added']

/** Tessel's small shop: what the cart and checkout sell. */
export const SHOP_CART = [
  { id: 'key', name: 'Security key, USB-C', variant: 'Pack of 2', price: 58, quantity: 1 },
  { id: 'hoodie', name: 'Tessel hoodie', variant: 'Graphite · M', price: 64, quantity: 1 },
  { id: 'stickers', name: 'Sticker sheet', variant: 'Deploy on Friday', price: 6, quantity: 2 },
]
export const SHOP_SHIPPING = [{ id: 'std', name: 'Standard', eta: 'Arrives Thu 6 Nov', price: 0 }, { id: 'exp', name: 'Express', eta: 'Arrives Mon 3 Nov', price: 12 }]

export const IMPORT_TARGETS = [
  { id: 'name', label: 'Full name', aliases: ['name'] },
  { id: 'email', label: 'Email', required: true, check: (v: string) => (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? undefined : 'Not a valid email') },
  { id: 'team', label: 'Team' },
  { id: 'role', label: 'Role', check: (v: string) => (/^(admin|member|viewer)$/i.test(v) ? undefined : 'Use admin, member or viewer') },
]
export const IMPORT_SAMPLE = { name: 'tessel-team.csv', text: 'Name,Email,Team,Role\nDara Nowak,dara@tessel.dev,Web,member\nKai Sorensen,kai@tessel,Data,member\nAmir Saleh,amir@tessel.dev,Mobile,owner\nRosa Delgado,rosa@tessel.dev,Platform,admin\n' }

// ---- The assistant: Tessel's help for a deploy that went wrong ----------------------------------------------------
import type { ActivityItem, AgentEvent, Availability, ContextUse, ModelOption, Note, PromptSuggestion, Participant, TraceSpan, ArtifactVersion, AgentSource } from '@weft/warp'
import type { Attendee, CalEvent, PrefGroup } from '@weft/warp-core'

export const DEPLOY_SOURCES: AgentSource[] = [
  { title: 'd-4819 build log', path: 'mobile-bff · 15:27', snippet: 'health check failed: upstream timed out after 3000 ms in ap-south' },
  { title: 'Health checks', path: 'Tessel docs · Deploys', snippet: 'A deploy that fails three checks in a row is held back from traffic.' },
  { title: 'c44e190', path: 'mobile-bff · retry.ts · L18', snippet: 'const attempts = 5 // was 2' },
]

const WHY_TEXT = 'Deploy `d-4819` failed its health check. The new retry code tries five times on every timed out upstream call, so one slow request in ap-south holds a connection for 15 seconds [1]. Three failed checks in a row held the deploy back, so nobody was served the bad version [2].\n\nThe cause is one line in the retry settings [3]:\n\n```TypeScript\nconst attempts = 5 // was 2\n```\n\n- `d-4801` is still live and healthy.\n- Lowering `attempts` to 2 should get the deploy through.\n'

export const WHY_FAILED: AgentEvent[] = [
  { kind: 'plan', steps: [{ id: 'logs', title: 'Read the build log', state: 'done' }, { id: 'diff', title: 'Compare with the last good deploy', state: 'done' }, { id: 'sum', title: 'Explain what went wrong', state: 'running' }] },
  { kind: 'reasoning', at: 0, text: 'The deploy reached the health check, so the build itself is fine. The log should say which check failed and in which region.' },
  { kind: 'tool', id: 'logs', name: 'read_logs', args: '{ "deploy": "d-4819", "lines": 200 }', at: 4000 },
  { kind: 'tool-result', id: 'logs', output: '3 failed checks\nupstream timed out after 3000 ms (ap-south)', ms: 640 },
  { kind: 'tool', id: 'diff', name: 'compare_deploys', args: '{ "from": "d-4801", "to": "d-4819" }' },
  { kind: 'tool-result', id: 'diff', output: '1 file changed\nsrc/retry.ts: attempts 2 → 5', ms: 410 },
  { kind: 'text', text: WHY_TEXT },
  ...DEPLOY_SOURCES.map((s): AgentEvent => ({ kind: 'source', ...s })),
  { kind: 'done' },
]

const ROLLBACK_ARGS = '{\n  "project": "mobile-bff",\n  "to": "d-4801",\n  "regions": ["ap-south"]\n}'

export const ROLLBACK_ASK: AgentEvent[] = [
  { kind: 'reasoning', text: 'A rollback changes production, so I should check the target first and ask before running it.' },
  { kind: 'tool', id: 'check', name: 'get_deploy', args: '{ "deploy": "d-4801" }' },
  { kind: 'tool-result', id: 'check', output: 'd-4801 · live · healthy · 412 ms p95', ms: 280 },
  { kind: 'text', text: '`d-4801` is healthy, so it is a safe place to go back to. This changes production, so I need your approval.' },
  { kind: 'approval', id: 'rollback', name: 'rollback', args: ROLLBACK_ARGS },
]

export const ROLLBACK_RUN: AgentEvent[] = [
  { kind: 'tool', id: 'rollback' },
  { kind: 'tool-result', id: 'rollback', output: 'mobile-bff is on d-4801 in ap-south', ms: 2100 },
  { kind: 'text', text: 'Done. `mobile-bff` is back on `d-4801`, and the checks are passing.' },
  { kind: 'done' },
]

export const ROLLBACK_DENIED: AgentEvent[] = [
  { kind: 'tool-result', id: 'rollback', denied: true },
  { kind: 'text', text: 'Okay, I left production as it is.' },
  { kind: 'done' },
]

export const MODELS: ModelOption[] = [
  { id: 'deep', name: 'Tessel Deep', short: 'Deep', provider: 'Hosted', description: 'Long investigations', capabilities: ['tools', 'logs'], context: '200k', cost: '$$$' },
  { id: 'swift', name: 'Tessel Swift', short: 'Swift', provider: 'Hosted', description: 'Fast, good at config', capabilities: ['tools'], context: '200k', cost: '$$' },
  { id: 'local', name: 'On-prem small', short: 'Small', provider: 'Your cluster', description: 'Stays on your network', context: '32k', cost: '$' },
]

export const COMMANDS: PromptSuggestion[] = [
  { value: '/logs', description: 'Read a deploy\'s log' },
  { value: '/rollback', description: 'Go back to an earlier deploy' },
  { value: '/status', description: 'Show every project\'s status' },
]

export const MENTIONS: PromptSuggestion[] = PEOPLE.slice(0, 4).map(p => ({ value: `@${p.id}`, description: p.name }))

export const CONTEXT: ContextUse = { used: 46000, limit: 200000, parts: [{ label: 'Logs', tokens: 22000 }, { label: 'History', tokens: 16000 }, { label: 'Tools', tokens: 8000 }] }

export const TRACE: TraceSpan[] = [{ id: 'turn', name: 'turn', start: 0, ms: 6200, tokens: 14100, cost: 0.042, children: [
  { id: 'think', name: 'reasoning', start: 0, ms: 900, tokens: 1200, cost: 0.004 },
  { id: 'logs', name: 'read_logs', start: 1000, ms: 640, tokens: 3100, cost: 0.009 },
  { id: 'diff', name: 'compare_deploys', start: 1700, ms: 1900, children: [{ id: 'fetch', name: 'fetch d-4801', start: 1750, ms: 700 }, { id: 'patch', name: 'diff', start: 2500, ms: 1050 }] },
  { id: 'text', name: 'write answer', start: 3700, ms: 2500, tokens: 2931, cost: 0.02 },
] }]

export const CONFIG_VERSIONS: ArtifactVersion[] = [
  { id: 'v3', label: 'v3 · two retries', meta: 'Assistant · now', code: 'project: mobile-bff\nregion: ap-south\nretry:\n  attempts: 2\n  timeout: 3s' },
  { id: 'v2', label: 'v2 · five retries', meta: 'Sam Okafor · 15:20', code: 'project: mobile-bff\nregion: ap-south\nretry:\n  attempts: 5\n  timeout: 3s' },
  { id: 'v1', label: 'v1 · first draft', meta: 'Sam Okafor · Oct 12', code: 'project: mobile-bff\nregion: ap-south' },
]

// ---- The team calendar: the week of Nov 2, seen from Tuesday morning -----------------------------------------------
export const TODAY = '2026-11-03'
export const SCHEDULE_NOW = '2026-11-03T10:40'
export const TEAM_ZONE = 'Europe/Stockholm'
export const TEAM_CALENDARS = ['Platform', 'Web', 'Data', 'Mobile', 'Releases', 'Time off'].map((name, i) => ({ id: i + 1, name }))

export const TEAM_EVENTS: CalEvent[] = [
  { id: 'e1', title: 'Platform standup', start: '2026-11-02T09:00', end: '2026-11-02T09:15', cal: 1, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', location: 'Room Atlas', attendees: ['Mara Lindqvist', 'Jun Tanaka'] },
  { id: 'e2', title: 'Platform standup', start: '2026-11-03T09:00', end: '2026-11-03T09:15', cal: 1, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR', location: 'Room Atlas', attendees: ['Mara Lindqvist', 'Jun Tanaka'] },
  { id: 'e3', title: 'Checkout review', start: '2026-11-03T10:00', end: '2026-11-03T11:00', cal: 2, video: true, attendees: ['Priya Raman', 'Tomás Oliveira', 'Mara Lindqvist'] },
  { id: 'e4', title: 'Incident review: mobile-bff', start: '2026-11-03T13:00', end: '2026-11-03T13:45', cal: 4, video: true, location: 'Room Birch', attendees: ['Sam Okafor', 'Inés Vidal', 'Jun Tanaka'] },
  { id: 'e5', title: 'Ranking v2 handover', start: '2026-11-03T15:00', end: '2026-11-03T16:00', cal: 3, location: 'Room Cedar', attendees: ['Lena Fischer', 'Noor Haddad'] },
  { id: 'e6', title: 'Priya out of office', start: '2026-11-03', end: '2026-11-03', allDay: true, cal: 6 },
  { id: 'e7', title: 'Release 2026.11', start: '2026-11-04T11:00', end: '2026-11-04T12:00', cal: 5, attendees: ['Mara Lindqvist', 'Jun Tanaka', 'Tomás Oliveira'] },
  { id: 'e8', title: 'Design crit', start: '2026-11-04T14:00', end: '2026-11-04T15:00', cal: 2, tentative: true, video: true },
  { id: 'e9', title: 'Cost review', start: '2026-11-05T10:00', end: '2026-11-05T11:00', cal: 1, recurrence: 'FREQ=MONTHLY', attendees: ['Mara Lindqvist', 'Lena Fischer'] },
  { id: 'e10', title: 'On-call handover', start: '2026-11-06T16:00', end: '2026-11-06T16:30', cal: 1, recurrence: 'FREQ=WEEKLY', video: true },
]

export const TEAM_ROOM: Attendee[] = [
  { id: 'mara', name: 'Mara Lindqvist', organizer: true, zone: TEAM_ZONE, busy: [[540, 555], [600, 660], [780, 825]] },
  { id: 'jun', name: 'Jun Tanaka', zone: 'Asia/Tokyo', hours: [540, 1080], busy: [[540, 555], [780, 825]] },
  { id: 'priya', name: 'Priya Raman', zone: 'Asia/Kolkata', hours: [540, 1080], busy: [[600, 660], [870, 930]] },
  { id: 'sam', name: 'Sam Okafor', zone: 'Africa/Lagos', hours: [540, 1080], busy: [[690, 750], [780, 825]] },
]
export const TEAM_MORE: Attendee[] = [{ id: 'lena', name: 'Lena Fischer', zone: 'Europe/Berlin', busy: [[900, 960]] }, { id: 'tomas', name: 'Tomás Oliveira', zone: 'Europe/Lisbon', busy: [[600, 660]] }]

export const ON_CALL_HOURS: Availability = {
  week: [1, 2, 3, 4, 5, 6, 0].map(day => ({ day, on: day > 0 && day < 6, ranges: day === 5 ? [[540, 840]] : [[540, 1020]] })),
  overrides: [{ id: 'o1', date: '2026-12-24', ranges: null, note: 'Christmas Eve' }, { id: 'o2', date: '2026-11-13', ranges: [[540, 780]], note: 'Half day' }],
}

// ---- Live: the notifications and calls around a deploy -------------------------------------------------------------
export const NOTES: Note[] = [
  { id: 'n1', actor: 'Sam Okafor', kind: 'mention', verb: 'mentioned you in', object: 'mobile-bff', time: '9 min', day: 'Today', source: 'Deploys', quote: 'Can you look at the retry settings before we redeploy?' },
  { id: 'n2', actor: 'Jun Tanaka', kind: 'approve', verb: 'asked you to approve', object: 'Release 2026.11', time: '32 min', day: 'Today', actions: [{ id: 'approve', label: 'Approve' }, { id: 'view', label: 'View', emphasis: 'outline' }] },
  { id: 'n3', actor: 'Tessel', kind: 'system', verb: 'failed the health check on', object: 'd-4819', detail: 'in ap-south', time: '1 h', day: 'Today' },
  { id: 'n4', actor: 'Mara Lindqvist', kind: 'invite', verb: 'invited you to', object: 'Incident review', detail: '· 13:00', time: '2 h', day: 'Today', source: 'Calendar', read: true },
  { id: 'n5', actor: 'Priya Raman', kind: 'comment', verb: 'commented on', object: 'storefront', time: 'Yesterday', day: 'Yesterday', quote: 'The edge cache cut image load times in half.', read: true },
  { id: 'n6', actor: 'Lena Fischer', kind: 'assign', verb: 'assigned you', object: 'Ranking v2 handover', time: 'Yesterday', day: 'Yesterday', read: true },
]

export const ACTIVITY: ActivityItem[] = [
  { id: 'a1', actor: 'Priya Raman', verb: 'deployed', object: 'storefront', detail: 'to eu-west', time: '16:42', day: 'Today' },
  { id: 'a2', actor: 'Lena Fischer', verb: 'started a build of', object: 'search-api', time: '16:10', day: 'Today' },
  { id: 'a3', actor: 'Sam Okafor', verb: 'rolled back', object: 'mobile-bff', detail: 'to d-4801', time: '15:41', day: 'Today' },
  { id: 'a4', actor: 'Tomás Oliveira', verb: 'deployed', object: 'checkout', time: '14:03', day: 'Today' },
  { id: 'a5', actor: 'Mara Lindqvist', verb: 'changed the plan for', object: 'billing', time: '17:20', day: 'Yesterday' },
  { id: 'a6', actor: 'Jun Tanaka', verb: 'paused', object: 'reports', time: '11:02', day: 'Yesterday' },
]

export const CHANNELS = [{ id: 'inapp', label: 'In-app' }, { id: 'email', label: 'Email' }, { id: 'push', label: 'Push' }, { id: 'sms', label: 'SMS' }]
export const PREF_GROUPS: PrefGroup[] = [
  { id: 'deploys', label: 'Deploys', events: [{ id: 'failed', label: 'Failed deploys', hint: 'A deploy you own fails a check' }, { id: 'live', label: 'Deploys gone live', hint: 'On projects you watch' }, { id: 'approve', label: 'Approvals', hint: 'A release needs your yes' }] },
  { id: 'team', label: 'Team', events: [{ id: 'mention', label: 'Mentions', hint: 'Someone @-mentions you' }, { id: 'invite', label: 'Invitations', hint: 'New events and changes' }] },
  { id: 'account', label: 'Account', events: [{ id: 'security', label: 'Security alerts', hint: 'New sign-in or API key', instant: true }, { id: 'billing', label: 'Billing', hint: 'Invoices and failed payments' }] },
]
export const PREFS = {
  failed: { inapp: true, email: true, push: true, sms: true }, live: { inapp: true, email: false, push: false }, approve: { inapp: true, email: true, push: true },
  mention: { inapp: true, email: true, push: true, sms: false }, invite: { inapp: true, email: true },
  security: { inapp: true, email: true, push: true, sms: true }, billing: { inapp: false, email: true },
}
export const PREF_OFFERED = { live: ['inapp', 'email', 'push'], approve: ['inapp', 'email', 'push'], invite: ['inapp', 'email'], billing: ['inapp', 'email'] }
export const PREF_LOCKED = { security: ['email'] }

export const CALL: Participant[] = [
  { id: 'sam', name: 'Sam Okafor', role: 'host', isSpeaking: true },
  { id: 'jun', name: 'Jun Tanaka', isMuted: true },
  { id: 'ines', name: 'Inés Vidal' },
  { id: 'mara', name: 'Mara Lindqvist', handRaised: true },
  { id: 'lena', name: 'Lena Fischer', isMuted: true, network: 'poor' },
  { id: 'tomas', name: 'Tomás Oliveira', isCamOn: false },
]
export const CALL_SELF: Participant = { id: 'priya', name: 'Priya Raman' }
export const CALL_DEVICES = {
  mics: [{ value: 'mbp', label: 'MacBook Pro Microphone' }, { value: 'pods', label: 'AirPods Pro' }],
  cameras: [{ value: 'hd', label: 'FaceTime HD Camera' }],
  speakers: [{ value: 'pods', label: 'AirPods Pro' }, { value: 'mbp', label: 'MacBook Pro Speakers' }],
}

// -- charts and dates ---------------------------------------------------------------------------------------------------

/** Monthly requests in millions, split by the three biggest regions. */
export const REQUESTS_BY_REGION = TRAFFIC.map((t, i) => ({
  month: t.month,
  euWest: Math.round(t.requests * (0.42 - i * 0.003) * 10) / 10,
  usEast: Math.round(t.requests * (0.3 + (i % 3) * 0.006) * 10) / 10,
  apSouth: Math.round(t.requests * (0.1 + i * 0.006) * 10) / 10,
}))

/** The monthly bill, by what it paid for. */
export const COST_BY_SERVICE = TRAFFIC.map(t => {
  const compute = Math.round(t.cost * 0.56), storage = Math.round(t.cost * 0.17), database = Math.round(t.cost * 0.15)
  return { month: t.month, compute, storage, database, network: t.cost - compute - storage - database }
})

export const DEPLOYS_BY_TEAM = [
  { quarter: 'Q4 2025', platform: 96, web: 142, data: 58, mobile: 41 },
  { quarter: 'Q1 2026', platform: 104, web: 151, data: 66, mobile: 47 },
  { quarter: 'Q2 2026', platform: 118, web: 164, data: 71, mobile: 52 },
  { quarter: 'Q3 2026', platform: 127, web: 188, data: 84, mobile: 49 },
  { quarter: 'Q4 2026', platform: 139, web: 203, data: 92, mobile: 61 },
]

export const PLAN_MIX = [
  { name: 'Hobby', value: 1240 },
  { name: 'Team', value: 610 },
  { name: 'Business', value: 240 },
  { name: 'Enterprise', value: 82 },
]

export const REGION_SLICES = REGIONS.map(r => ({ name: r.region, value: r.requests }))
export const PROJECT_COSTS = [...PROJECTS].sort((a, b) => b.cost - a.cost).slice(0, 6).map(p => ({ name: p.name, value: p.cost }))

/** This quarter's goals, as shares of the target. */
export const GOALS = [
  { name: 'Deploys under 3 min', value: 0.86 },
  { name: 'Uptime target', value: 0.74 },
  { name: 'Teams on CI', value: 0.58 },
  { name: 'Docs coverage', value: 0.37 },
]

export const SIGNUP_FUNNEL = [
  { name: 'Visited pricing', value: 12400 },
  { name: 'Signed up', value: 2232 },
  { name: 'First deploy', value: 1410 },
  { name: 'Invited a teammate', value: 760 },
  { name: 'Paid', value: 508 },
]

const REGION_GROUP: Record<string, string> = { 'eu-west': 'Europe', 'eu-north': 'Europe', 'us-east': 'Americas', 'us-west': 'Americas' }
const pointsIn = (group: string) => PROJECTS.filter(p => (REGION_GROUP[p.region] ?? 'Elsewhere') === group).map(p => ({ name: p.name, x: p.deploys, y: p.latency, size: Math.round(p.cost / 100) }))
/** Every project: deploys, latency in ms, and monthly cost in hundreds of dollars for the size. */
export const PROJECT_POINTS = ['Europe', 'Americas', 'Elsewhere'].map(name => ({ name, points: pointsIn(name) }))

const wobble = (i: number) => Math.sin(i * 12.9898) * 43758.5453 % 1

/** 240 request latencies from one hour of storefront, in ms. */
export const LATENCIES = Array.from({ length: 240 }, (_, i) => Math.round(62 + Math.abs(wobble(i)) * 70 + Math.abs(wobble(i + 300)) * 50 + (i % 37 === 0 ? 160 : 0)))

/** The same hour by region, for spread. */
export const LATENCY_BY_REGION = ['eu-west', 'us-east', 'ap-south', 'us-west', 'eu-north'].map((name, r) => ({
  name,
  values: Array.from({ length: 60 }, (_, i) => Math.round(58 + r * 21 + Math.abs(wobble(i + r * 80)) * (40 + r * 14) + (i === 7 + r ? 140 : 0))),
}))

const WEEK_DAYS = [3, 5, 4, 6, 3, 0, 1]
/** Deploys per day for 26 weeks, each week an array of seven. */
export const DEPLOY_WEEKS = Array.from({ length: 26 }, (_, w) => `W${w + 19}`)
export const DEPLOY_HEAT = DEPLOY_WEEKS.map((_, w) => WEEK_DAYS.map((d, i) => (d === 0 ? 0 : Math.max(0, Math.round(d * (0.7 + w * 0.04) + wobble(w * 7 + i) * 3)))))

export const SKILLS = {
  axes: ['Speed', 'Uptime', 'Test coverage', 'Docs', 'Cost', 'Security'],
  data: [
    { name: 'storefront', values: [0.84, 0.97, 0.72, 0.58, 0.62, 0.8] },
    { name: 'mobile-bff', values: [0.46, 0.68, 0.51, 0.34, 0.74, 0.66] },
  ],
}

const TEAM_OF: Record<string, string> = { storefront: 'Web', checkout: 'Web', 'search-api': 'Data', ingest: 'Data', reports: 'Data', billing: 'Platform', auth: 'Platform', notifier: 'Platform', 'edge-cache': 'Platform', 'mobile-bff': 'Mobile' }
export const PROJECT_TREE = PROJECTS.map(p => ({ name: p.name, value: p.cost, group: TEAM_OF[p.id] }))

export const SPEND_TREE = [
  { name: 'Compute', children: [{ name: 'Builds', value: 2120 }, { name: 'Functions', value: 1840 }, { name: 'Edge', value: 1040 }] },
  { name: 'Storage', children: [{ name: 'Artifacts', value: 980 }, { name: 'Logs', value: 540 }] },
  { name: 'Database', children: [{ name: 'Primary', value: 860 }, { name: 'Replicas', value: 480 }] },
  { name: 'Network', children: [{ name: 'CDN', value: 720 }, { name: 'Egress', value: 350 }] },
]

/** How October's builds ended up: nodes in columns, links by index. */
export const BUILD_FLOW = {
  nodes: [
    { name: 'Push to main', column: 0 }, { name: 'Pull request', column: 0 }, { name: 'Scheduled', column: 0 },
    { name: 'Tests passed', column: 1 }, { name: 'Tests failed', column: 1 },
    { name: 'Live', column: 2 }, { name: 'Preview', column: 2 }, { name: 'Rolled back', column: 2 },
  ],
  data: [
    { from: 0, to: 3, value: 412 }, { from: 0, to: 4, value: 46 }, { from: 1, to: 3, value: 688 }, { from: 1, to: 4, value: 174 }, { from: 2, to: 3, value: 90 }, { from: 2, to: 4, value: 12 },
    { from: 3, to: 5, value: 470 }, { from: 3, to: 6, value: 688 }, { from: 3, to: 7, value: 32 },
  ],
}

/** checkout's p95 latency each day of October, in ms. */
export const LATENCY_DAYS = Array.from({ length: 30 }, (_, i) => {
  const open = 112 + Math.sin(i / 4) * 14 + i * 0.3, close = open + wobble(i + 40) * 12
  return { label: `Oct ${i + 1}`, open: Math.round(open), close: Math.round(close), high: Math.round(Math.max(open, close) + 3 + Math.abs(wobble(i)) * 9), low: Math.round(Math.min(open, close) - 3 - Math.abs(wobble(i + 9)) * 7) }
})

/** From last quarter's paying seats to this quarter's. */
export const SEATS_BRIDGE = [
  { name: 'Q3', value: 820, total: true },
  { name: 'New teams', value: 210 },
  { name: 'Expansion', value: 96 },
  { name: 'Contraction', value: -38 },
  { name: 'Churn', value: -74 },
  { name: 'Q4', value: 1014, total: true },
]

/** One day per row, since the start of the year's second half. */
export const SIGNUPS_DAILY = Array.from({ length: 120 }, (_, i) => ({ day: `Day ${i + 1}`, signups: Math.round(118 + Math.sin(i / 9) * 26 + i * 0.5 + wobble(i) * 12) }))

/** Teams on Tessel by US state. */
export const TEAMS_BY_STATE = 'AK,ME,VT,NH,WA,ID,MT,ND,MN,IL,WI,MI,NY,RI,MA,OR,NV,WY,SD,IA,IN,OH,PA,NJ,CT,CA,UT,CO,NE,MO,KY,WV,VA,MD,DE,AZ,NM,KS,AR,TN,NC,SC,DC,OK,LA,MS,AL,GA,HI,TX,FL'.split(',').map((id, i) => ({
  id,
  value: ({ CA: 188, NY: 142, TX: 121, WA: 96, MA: 74, IL: 68, CO: 57, GA: 44, FL: 52 } as Record<string, number>)[id] ?? 4 + (i * 37) % 31,
}))

/** One Monday in Tessel's week. Fixed, so server and client agree. */
export const CAL_TODAY = '2026-11-02'
export const CAL_NOW = '2026-11-04T10:40'
export const CALENDARS = ['Releases', 'On-call', 'Team', 'Customers'].map((name, i) => ({ id: i + 1, name }))
export const ROOMS = [{ id: 'atlas', name: 'Atlas', meta: '8 seats' }, { id: 'birch', name: 'Birch', meta: '6 seats' }, { id: 'cedar', name: 'Cedar', meta: '12 seats' }]
export const EVENTS = [
  { id: 'e1', title: 'Standup', start: '2026-11-02T09:30', end: '2026-11-02T09:45', cal: 3, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { id: 'e2', title: 'Standup', start: '2026-11-03T09:30', end: '2026-11-03T09:45', cal: 3, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { id: 'e3', title: 'Standup', start: '2026-11-04T09:30', end: '2026-11-04T09:45', cal: 3, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { id: 'e4', title: 'Standup', start: '2026-11-05T09:30', end: '2026-11-05T09:45', cal: 3, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { id: 'e5', title: 'Standup', start: '2026-11-06T09:30', end: '2026-11-06T09:45', cal: 3, recurrence: 'FREQ=WEEKLY;BYDAY=MO,TU,WE,TH,FR' },
  { id: 'e6', title: 'Ship checkout to production', start: '2026-11-02T11:00', end: '2026-11-02T12:00', cal: 1, location: 'Room Atlas', attendees: ['Tomás Oliveira', 'Mara Lindqvist'], resource: 'atlas' },
  { id: 'e7', title: 'Search ranking review', start: '2026-11-03T14:00', end: '2026-11-03T15:30', cal: 3, attendees: ['Lena Fischer', 'Noor Haddad'], video: true, resource: 'birch' },
  { id: 'e8', title: 'Acme onboarding', start: '2026-11-04T10:00', end: '2026-11-04T11:00', cal: 4, video: true, attendees: ['Priya Raman'] },
  { id: 'e9', title: 'Incident review: mobile-bff', start: '2026-11-04T10:30', end: '2026-11-04T11:30', cal: 2, attendees: ['Sam Okafor', 'Jun Tanaka'], resource: 'cedar' },
  { id: 'e10', title: 'Rotate edge certificates', start: '2026-11-05T13:00', end: '2026-11-05T14:00', cal: 2, locked: true, location: 'Do not move' },
  { id: 'e11', title: 'Northwind renewal', start: '2026-11-05T15:00', end: '2026-11-05T16:00', cal: 4, tentative: true, location: 'Waiting on Inés' },
  { id: 'e12', title: 'Release retro', start: '2026-11-06T11:00', end: '2026-11-06T12:00', cal: 1, video: true, resource: 'atlas' },
  { id: 'e13', title: 'Design crit', start: '2026-11-04T09:00', end: '2026-11-04T10:00', cal: 3, resource: 'atlas' },
  { id: 'e14', title: 'Hiring sync', start: '2026-11-04T13:00', end: '2026-11-04T14:30', cal: 3, resource: 'atlas' },
  { id: 'e15', title: 'Billing walkthrough', start: '2026-11-04T11:00', end: '2026-11-04T12:00', cal: 4, resource: 'birch' },
  { id: 'e16', title: 'Roadmap', start: '2026-11-04T15:00', end: '2026-11-04T16:30', cal: 3, resource: 'cedar' },
  { id: 'a1', title: 'Jun on call', start: '2026-11-02', end: '2026-11-04', allDay: true, cal: 2 },
  { id: 'a2', title: 'Release 2026.11', start: '2026-11-06', end: '2026-11-06', allDay: true, cal: 1 },
]

// -- the collab pack: the same people, in a room --
import type { ChatConversation, CommentThreadData, IntegrityEvent, ShareContact, ShareMember, Version, ViewportPeer, ChatMessage, CursorPeer, IntegrityStats, Peer } from '@weft/warp'

export const PEERS: Peer[] = PEOPLE.map((p, i) => ({ id: p.id, name: p.name, color: i + 1 }))
export const [MARA, JUN, PRIYA, TOMAS, LENA, NOOR, SAM, INES] = PEERS

export const CONVERSATIONS: ChatConversation[] = [
  { id: 'incidents', name: '# incidents', color: 3, channel: true, preview: 'Sam: Rolled back, 5xx are dropping', time: '15:41', unread: 3, pinned: true },
  { id: 'deploys', name: '# deploys', color: 5, channel: true, preview: 'storefront is live', time: '16:42', unread: 1 },
  { id: 'jun', name: 'Jun Tanaka', color: 2, preview: 'You: thanks, merging now', time: '14:30', online: true },
  { id: 'web', name: '# web', color: 4, channel: true, preview: 'Priya: new image cache is in', time: '12:05' },
  { id: 'lena', name: 'Lena Fischer', color: 5, preview: 'Ranking v2 is building', time: 'Thu' },
  { id: 'random', name: '# random', color: 8, channel: true, preview: 'Tomás pinned a message', time: 'Wed', muted: true },
]

const AT = 1_793_460_000_000
const min = 60_000
export const CHAT: ChatMessage[] = [
  { id: 'm1', author: SAM, time: '15:27', at: AT, day: 'Yesterday', text: 'mobile-bff d-4819 failed its health check on ap-south.' },
  { id: 'm2', author: SAM, time: '15:28', at: AT + min, day: 'Yesterday', text: 'Looks like the retry change. Upstream calls pile up after a timeout.', attachment: { kind: 'LOG', name: 'd-4819.log', meta: '48 KB · 1,204 lines' } },
  { id: 'm3', author: JUN, time: '15:31', at: AT + 4 * min, day: 'Yesterday', text: 'Edge cache is holding. Roll back and we look at it tomorrow?', reactions: [{ emoji: '👍', label: 'Thumbs up', count: 2, names: ['Sam', 'Mara'] }] },
  { id: 'm4', author: MARA, mine: true, time: '15:33', at: AT + 6 * min, day: 'Yesterday', text: 'Yes, roll it back. I will tell support.', state: 'read', readAt: '15:34' },
  { id: 'm5', author: SAM, time: '09:12', at: AT + 1060 * min, day: 'Today', text: 'Rolled back last night. 5xx are at zero. @you the fix is on a branch.', mentions: ['you'], replies: { count: 2, last: '09:40', people: [JUN, LENA] } },
  { id: 'm6', author: LENA, time: '09:18', at: AT + 1066 * min, day: 'Today', quote: { ref: 'm2', text: 'Upstream calls pile up after a timeout.' }, text: 'search-api had the same thing in March. A jittered backoff fixed it.' },
  { id: 'm7', author: MARA, mine: true, time: '09:21', at: AT + 1069 * min, day: 'Today', text: 'Good catch. Sam, can you add that before we retry?', state: 'read', readAt: '09:22' },
  { id: 'm8', author: SAM, time: '09:24', at: AT + 1072 * min, day: 'Today', text: 'On it. New deploy after lunch.', reactions: [{ emoji: '🎉', label: 'Party', count: 1, names: ['Mara'] }] },
]

export const COMMENT_TIMEOUTS: CommentThreadData = {
  id: 'c-timeouts',
  comments: [
    { id: 'a', author: LENA, time: '10:12', text: 'Should this say 30 seconds? The stale window changed on Friday.' },
    { id: 'b', author: JUN, time: '10:20', text: 'Yes. d-4817 lowered it, I will update the number.' },
  ],
}
export const COMMENT_OWNER: CommentThreadData = { id: 'c-owner', comments: [{ id: 'c', author: PRIYA, time: 'Mon', text: 'Who signs off on the rollback rule, Mara or the on-call person?' }] }

export const VERSIONS: Version[] = [
  { id: 'v5', title: 'Current', meta: 'Jun, Lena, you · now', current: true },
  { id: 'v4', title: 'After the d-4819 review', meta: 'Jun · 10:02', named: true },
  { id: 'v3', title: 'Autosave', meta: 'You · 09:41' },
  { id: 'v2', title: 'Autosave', meta: 'Lena · Yesterday' },
  { id: 'v1', title: 'First draft', meta: 'Sam · Mon', named: true },
]

export const SHARE_MEMBERS: ShareMember[] = [
  { ...MARA, email: 'mara@tessel.dev', role: 'owner' },
  { ...JUN, email: 'jun@tessel.dev', role: 'editor' },
  { ...LENA, email: 'lena@tessel.dev', role: 'commenter' },
]
export const SHARE_PEOPLE: ShareContact[] = [{ ...PRIYA, email: 'priya@tessel.dev' }, { ...TOMAS, email: 'tomas@tessel.dev' }, { ...SAM, email: 'sam@tessel.dev' }]

export const INTEGRITY_STATS: IntegrityStats = { sent: 42, received: 41, duplicate: 1, outOfOrder: 0, lagP95: 54 }
export const INTEGRITY_EVENTS: IntegrityEvent[] = [
  { id: 'e3', seq: 42, kind: 'status', route: 'Jun → you', lag: 31 },
  { id: 'e2', seq: 41, kind: 'title', route: 'Jun → you', note: 'duplicate, ignored', lag: 54 },
  { id: 'e1', seq: 41, kind: 'title', route: 'Jun → you', lag: 28 },
]

export const CURSOR_PEERS: CursorPeer[] = [{ ...JUN, cursor: { anchor: 'title', x: 0.42, y: 0.8 } }, { ...LENA, cursor: { anchor: 'body', x: 0.7, y: 0.35 } }, { ...SAM, cursor: { anchor: 'body', x: 0.22, y: 0.85 } }]
export const VIEWPORT_PEERS: ViewportPeer[] = [{ ...JUN, top: 0.12, height: 0.3 }, { ...LENA, top: 0.55, height: 0.3 }]

/** Deploys per day in 2026 up to today, for a year of density dots. Weekends are quiet. */
export const DEPLOYS_BY_DAY: Record<string, number> = Object.fromEntries(
  Array.from({ length: 307 }, (_, i) => {
    const day = new Date(Date.UTC(2026, 0, 1 + i))
    const weekend = day.getUTCDay() % 6 === 0
    return [day.toISOString().slice(0, 10), weekend ? (i % 5 === 0 ? 1 : 0) : 1 + ((i * 7) % 9)] as const
  }).filter(([, n]) => n > 0),
)
