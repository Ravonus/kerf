import { Link } from '@weft-js/start'
import { AppearanceGate } from './AppearanceGate'
import { Mark } from './Mark'
import { NavSheet } from './NavSheet'
import { SearchTrigger } from './SearchTrigger'
import { Nav } from '@weft-js/warp'

export const NAV = [
  { href: '/learn', label: 'Learn' },
  { href: '/reference', label: 'Reference' },
  { href: '/components', label: 'Components' },
  { href: '/blocks', label: 'Blocks' },
  { href: '/charts', label: 'Charts' },
  { href: '/art', label: 'Art' },
  { href: '/icons', label: 'Icons' },
]

/** The bar on every page. Static: its links need no script, and the three controls are islands. */
export function Header() {
  return (
    <header data-site="header" data-vt="bar" data-expression="balanced">
      <Link data-site="skip" href="#content">Skip to content</Link>
      <div data-site="bar">
        <Link href="/" class="brand"><Mark /><span>weft</span></Link>
        <Nav label="Main" data-site="top-nav">
          {NAV.map(n => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        </Nav>
        <span data-site="grow"></span>
        <SearchTrigger />
        <Link data-site="repo" data-scope="button" data-emphasis="ghost" data-tone="neutral" data-size="sm" href="https://github.com/Ravonus/weft" rel="external">GitHub</Link>
        <AppearanceGate />
        <NavSheet />
      </div>
    </header>
  )
}
