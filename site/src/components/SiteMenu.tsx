import { derived } from '@kerf/core'
import { currentPath } from '@kerf/start'
import { HamburgerMenu } from '@kerf/veneer'
import { NAV } from '../lib/nav'
import { Mark } from './Mark.gen'

/** The site's top links under 900px. A section's own pages stay in its SideNav. */
export function SiteMenu() {
  const top = derived(() => `/${currentPath().split('/')[1] ?? ''}`)
  return (
    <HamburgerMenu
      label="Menu"
      links={NAV}
      current={top.value}
      brand={
        <a href="/" class="brand">
          <Mark />
          <span>Kerf</span>
        </a>
      }
    />
  )
}
