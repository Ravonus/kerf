import { Link } from '@weft-js/start'
import { Drawer } from '@weft-js/warp'
import { type State } from '@weft-js/core'
import { NAV } from './Header'

/**
 * The phone's site menu: the top links only. Each section's own pages are in its SideNav, whose bar sits under the
 * header, so this stays short. A link closes the sheet.
 */
export function NavDrawer(props: { open: State<boolean> }) {
  return (
    <Drawer open={props.open} title="weft" side="left">
      <nav
        aria-label="Site"
        data-site="sheet-nav"
        onClick={(e) => {
          if ((e.target as Element).closest('a')) props.open.value = false
        }}
      >
        {NAV.map((n) => (
          <Link key={n.href} href={n.href}>
            {n.label}
          </Link>
        ))}
      </nav>
    </Drawer>
  )
}
