import { REGIONS } from './traffic'
import { PROJECTS } from './projects'

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

export const REGION_SLICES = REGIONS.map((r) => ({ name: r.region, value: r.requests }))

export const PROJECT_COSTS = [...PROJECTS]
  .sort((a, b) => b.cost - a.cost)
  .slice(0, 6)
  .map((p) => ({ name: p.name, value: p.cost }))
