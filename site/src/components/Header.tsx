import { Link } from '@kerf/start'
import { AppearanceGate } from './AppearanceGate'
import { BrandTitle } from './BrandTitle'
import { NAV } from '../lib/nav'
import { SiteMenu } from './SiteMenu'
import { SearchTrigger } from './SearchTrigger'
import { Nav } from '@kerf/veneer'

/** The bar on every page. Static: its links need no script, and the three controls are islands. */
export function Header() {
  return (
    <header data-site="header" data-vt="bar" data-expression="balanced">
      <Link data-site="skip" href="#content">
        Skip to content
      </Link>
      <div data-site="bar">
        <BrandTitle />
        <Nav label="Main" data-site="top-nav">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} match="section">
              {n.label}
            </Link>
          ))}
        </Nav>
        <span data-site="grow"></span>
        <SearchTrigger />
        <Link
          data-site="repo"
          data-scope="button"
          data-emphasis="ghost"
          data-tone="neutral"
          data-size="sm"
          href="https://github.com/Ravonus/kerf"
          rel="external"
        >
          GitHub
        </Link>
        <AppearanceGate />
        <span data-site="menu">
          <SiteMenu />
        </span>
      </div>
    </header>
  )
}
