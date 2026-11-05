import { PROJECTS } from './projects'

export const SKILLS = {
  axes: ['Speed', 'Uptime', 'Test coverage', 'Docs', 'Cost', 'Security'],
  data: [
    { name: 'storefront', values: [0.84, 0.97, 0.72, 0.58, 0.62, 0.8] },
    { name: 'mobile-bff', values: [0.46, 0.68, 0.51, 0.34, 0.74, 0.66] },
  ],
}

export const TEAM_OF: Record<string, string> = {
  storefront: 'Web',
  checkout: 'Web',
  'search-api': 'Data',
  ingest: 'Data',
  reports: 'Data',
  billing: 'Platform',
  auth: 'Platform',
  notifier: 'Platform',
  'edge-cache': 'Platform',
  'mobile-bff': 'Mobile',
}

export const PROJECT_TREE = PROJECTS.map((p) => ({
  name: p.name,
  value: p.cost,
  group: TEAM_OF[p.id],
}))
