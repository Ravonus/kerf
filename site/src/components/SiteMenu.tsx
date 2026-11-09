import { derived } from '@weft-js/core'
import { currentPath } from '@weft-js/start'
import { HamburgerMenu } from '@weft-js/warp'
import { NAV } from '../lib/nav'
import { Mark } from './Mark'

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
          <span>weft</span>
        </a>
      }
    />
  )
}
