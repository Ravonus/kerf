import { Link } from '@weft/start'
import { Appearance } from './Appearance'
import { Mark } from './Mark'
import { NavSheet } from './NavSheet'
import { SearchTrigger } from './SearchTrigger'

export const NAV = [
  { href: '/docs', label: 'Docs' },
  { href: '/examples', label: 'Examples' },
  { href: '/toolkit', label: 'Toolkit' },
  { href: '/icons', label: 'Icons' },
]

/** The bar on every page. Static: its links need no script, and the three controls are islands. */
export function Header() {
  return (
    <header data-site="header">
      <Link data-site="skip" href="#content">Skip to content</Link>
      <div data-site="bar">
        <Link href="/" class="brand"><Mark /><span>weft</span></Link>
        <nav aria-label="Main">
          {NAV.map(n => <Link key={n.href} href={n.href}>{n.label}</Link>)}
        </nav>
        <span data-site="grow"></span>
        <SearchTrigger />
        <Appearance />
        <NavSheet />
      </div>
    </header>
  )
}
