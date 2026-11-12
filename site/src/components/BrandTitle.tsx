import { derived } from '@kerf-js/core'
import { currentPath, Link } from '@kerf-js/start'
import { SideNavTitle } from '@kerf-js/veneer'
import { NAV } from '../lib/nav'
import { Mark } from './Mark.gen'

const labelFor = (top: string) => NAV.find((n) => n.href === `/${top}`)?.label ?? ''

/** The brand in the bar. On a phone, while the sidebar is open, its word gives way to the section's name. */
export function BrandTitle() {
  const title = derived(() => labelFor(currentPath().split('/')[1] ?? ''))
  return (
    <Link href="/" class="brand">
      <Mark />
      <SideNavTitle title={title.value}>
        <span data-site="wordmark">kerfjs</span>
      </SideNavTitle>
    </Link>
  )
}
