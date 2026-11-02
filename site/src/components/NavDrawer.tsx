import { Link } from '@weft-js/start'
import { Drawer } from '@weft-js/warp'
import { type State } from '@weft-js/core'
import learn from '../generated/learn-nav.json'
import reference from '../generated/reference-nav.json'
import { warpGroups } from '../lib/warp-nav'
import { NAV } from './Header'
import { NavGroups } from './SideNav'


/** What the left rail holds, for the section this page is in. */
function section() {
  const path = location.pathname
  if (path.startsWith('/learn')) return [{ title: 'Learn weft', pinned: true, items: [{ href: '/learn', label: 'Overview' }] }, ...learn.map((g, n) => ({ title: `${n + 1}. ${g.section}`, items: g.items.map(i => ({ href: `/learn/${i.slug}`, label: i.title })) }))]
  if (path.startsWith('/reference')) return reference.map(g => ({ title: g.section, items: g.items.map(i => ({ href: `/reference/${i.slug}`, label: i.title })) }))
  for (const area of ['components', 'blocks', 'charts'] as const) if (path.startsWith(`/${area}`)) return warpGroups(area)
  return []
}

/**
 * The phone's nav: a warp sheet with the top links, then this section's pages. Learn's chapters fold as on the wide rail,
 * with this page's chapter open. Only a link closes the sheet, so opening a chapter keeps it up.
 */
export function NavDrawer(props: { open: State<boolean> }) {
  return (
    <Drawer open={props.open} title="weft" side="auto">
      <nav aria-label="Pages" data-site="sheet-nav" onClick={e => { if ((e.target as Element).closest('a')) props.open.value = false }}>
        {NAV.map(n => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        <NavGroups label="Pages" groups={section()} current={location.pathname} fold={location.pathname.startsWith('/learn')} />
      </nav>
    </Drawer>
  )
}
