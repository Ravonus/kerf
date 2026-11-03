import type { SideNavSection } from '@weft-js/warp'
import learn from '../generated/learn-nav.json'
import reference from '../generated/reference-nav.json'
import toolkit from '../generated/toolkit-nav.json'
import type { Area } from './pages'
import { NAV } from '../components/Header'

/** The site's top links, at the head of the panel when it opens over a phone's page. */
export const SITE_LINKS = NAV

/** Learn's chapters in teaching order, numbered, so the rail reads as a path from the top. */
export const learnSections: SideNavSection[] = [
  { title: 'Learn weft', pinned: true, items: [{ href: '/learn', label: 'Overview' }] },
  ...learn.map((g, n) => ({ title: `${n + 1}. ${g.section}`, items: g.items.map(i => ({ href: `/learn/${i.slug}`, label: i.title })) })),
]

export const referenceSections: SideNavSection[] = reference.map(g => ({ title: g.section, items: g.items.map(i => ({ href: `/reference/${i.slug}`, label: i.title })) }))

/** The toolkit's own pages, at the top of every toolkit rail, so Art and Icons sit beside the areas. */
const TOOLKIT: SideNavSection = {
  title: 'Toolkit',
  items: [
    { href: '/components', label: 'All components' },
    { href: '/blocks', label: 'All blocks' },
    { href: '/charts', label: 'All charts' },
    { href: '/icons', label: 'Icons' },
    { href: '/art', label: 'Art' },
  ],
}

/** A toolkit area's rail: the toolkit's pages, then the area's groups. Art and Icons have no groups of their own. */
export const toolkitSections = (area: Area | 'art' | 'icons'): SideNavSection[] => [
  TOOLKIT,
  ...toolkit.filter(g => g.area === area).map(g => ({ title: g.group, items: g.items.map(i => ({ href: i.href, label: i.name })) })),
]

export const AREA_LABEL: Record<Area | 'art' | 'icons', string> = { components: 'Components', blocks: 'Blocks', charts: 'Charts', art: 'Art', icons: 'Icons' }
