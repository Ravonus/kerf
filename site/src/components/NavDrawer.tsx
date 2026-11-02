import { Link } from '@weft-js/start'
import { Drawer } from '@weft-js/warp'
import { type State } from '@weft-js/core'

const LINKS = [['/docs', 'Docs'], ['/examples', 'Examples'], ['/toolkit', 'Toolkit'], ['/icons', 'Icons']] as const

/** The phone's nav: a warp sheet. */
export function NavDrawer(props: { open: State<boolean> }) {
  return (
    <Drawer open={props.open} title="weft" side="auto">
      <nav aria-label="Pages" data-site="sheet-nav" onClick={() => (props.open.value = false)}>
        {LINKS.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
      </nav>
    </Drawer>
  )
}
