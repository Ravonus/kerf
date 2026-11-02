import nav from '../generated/toolkit-nav.json'
import type { NavGroup } from '../components/SideNav'
import type { Area } from './pages'

const ALL: Record<Area, string> = { components: 'All components', blocks: 'All blocks', charts: 'All charts' }

/** One area's rail. The phone's sheet shows the same. */
export const warpGroups = (area: Area): NavGroup[] => [
  { title: 'Get started', items: [{ href: `/${area}`, label: ALL[area] }] },
  ...nav.filter(g => g.area === area).map(g => ({ title: g.group, items: g.items.map(i => ({ href: i.href, label: i.name })) })),
]
