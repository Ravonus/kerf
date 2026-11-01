import { Link } from '@weft/start'
import { Button, Drawer } from '@weft/warp'
import { state } from 'weft'

const LINKS = [['/docs', 'Docs'], ['/examples', 'Examples'], ['/toolkit', 'Toolkit'], ['/icons', 'Icons']] as const

/** The phone's nav: a warp sheet. The button is hidden from 720px, where the links sit in the bar. */
export function NavSheet() {
  const open = state(false)
  return (
    <>
      <Button data-site="menu" emphasis="ghost" tone="neutral" size="sm" icon="menu" label="Menu" onClick={() => (open.value = true)} />
      <Drawer open={open} title="weft" side="auto">
        <nav aria-label="Pages" data-site="sheet-nav" onClick={() => (open.value = false)}>
          {LINKS.map(([href, label]) => <Link key={href} href={href}>{label}</Link>)}
        </nav>
      </Drawer>
    </>
  )
}
