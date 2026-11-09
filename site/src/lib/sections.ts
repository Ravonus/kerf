import type { SideNavSection } from '@weft-js/warp'
import learn from '../generated/learn-nav.json'
import reference from '../generated/reference-nav.json'
import toolkit from '../generated/toolkit-nav.json'
import type { Area } from './pages'

/** Learn's chapters in teaching order, numbered, so the rail reads as a path from the top. */
export const learnSections: SideNavSection[] = [
  { title: 'Learn Weft', pinned: true, items: [{ href: '/learn', label: 'Overview' }] },
  ...learn.map((g, n) => ({
    title: `${n + 1}. ${g.section}`,
    items: g.items.map((i) => ({ href: `/learn/${i.slug}`, label: i.title })),
  })),
]

export const referenceSections: SideNavSection[] = reference.map((g) => ({
  title: g.section,
  items: g.items.map((i) => ({ href: `/reference/${i.slug}`, label: i.title })),
}))

/** A toolkit area's rail: the area's groups. Art and Icons have none of their own. */
export const toolkitSections = (area: Area | 'art' | 'icons'): SideNavSection[] => [
  ...(area === 'components'
    ? [
        {
          title: 'Theming',
          pinned: true,
          items: [{ href: '/components/theme-studio', label: 'Theme studio' }],
        },
      ]
    : []),
  ...toolkit
    .filter((g) => g.area === area)
    .map((g) => ({ title: g.group, items: g.items.map((i) => ({ href: i.href, label: i.name })) })),
]

export const AREA_LABEL: Record<Area | 'art' | 'icons', string> = {
  components: 'Components',
  blocks: 'Blocks',
  charts: 'Charts',
  art: 'Art',
  icons: 'Icons',
}
