import { Link } from '@weft/start'
import { Drawer } from '@weft/warp'
import { type State } from 'weft'
import docs from '../generated/docs-nav.json'
import { warpGroups } from '../lib/warp-nav'
import { NAV } from './Header'


/** What the left rail holds, for the section this page is in. */
function section() {
  const path = location.pathname
  if (path.startsWith('/docs')) return docs.map(g => ({ title: g.section, items: g.items.map(i => ({ href: `/docs/${i.slug}`, label: i.title })) }))
  for (const area of ['components', 'blocks', 'charts'] as const) if (path.startsWith(`/${area}`)) return warpGroups(area)
  return []
}

/** The phone's nav: a warp sheet with the top links, then this section's pages. The page itself opens on its content. */
export function NavDrawer(props: { open: State<boolean> }) {
  return (
    <Drawer open={props.open} title="weft" side="auto">
      <nav aria-label="Pages" data-site="sheet-nav" onClick={() => (props.open.value = false)}>
        {NAV.map(n => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        {section().map(g => <div key={g.title}><h2>{g.title}</h2>{g.items.map(i => <Link key={i.href} href={i.href}>{i.label}</Link>)}</div>)}
      </nav>
    </Drawer>
  )
}
