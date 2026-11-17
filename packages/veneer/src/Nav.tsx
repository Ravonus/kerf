import { navIndicator } from '@kerf-js/veneer-core'
import { use } from '@kerf-js/veneer-core/kerf'
import './styles'
import '@kerf-js/veneer-core/styles/components/nav.css'

/**
 * The bar's view-transition name, from the nav's label: the same on every page for the same nav, so the bar carries
 * across a page transition, and different for a site nav and the section tabs under it. Two elements under one name
 * make the browser skip the whole transition.
 */
const barName = (label: string) =>
  `veneer-nav-${label
    .trim()
    .toLowerCase()
    .replace(/[\s_-]+/g, '-')
    .replace(/[^a-z0-9-]/gu, (ch) => ch.codePointAt(0)!.toString(36))}`

/**
 * Links with Veneer's sliding bar. It grows in from an item's edge, slides as the route or the pointer moves, and grows
 * out through the far edge. Mark the current link with `aria-current` (`Link` from `@kerf-js/start` does). `spy` follows
 * the headings of a table of contents. The bar is on the current link in the server's HTML, so nothing moves on load.
 * A horizontal nav's bar has a view-transition name of its own, made from `label`: give each nav on a page its own label.
 */
export function Nav({
  label,
  axis = 'x',
  spy,
  children,
  ...rest
}: {
  label: string
  axis?: 'x' | 'y'
  spy?: boolean | undefined
  children?: unknown
  [attr: string]: unknown
}) {
  let el: HTMLElement | undefined
  use(
    navIndicator,
    () => el,
    () => ({ axis, spy }),
  )
  return (
    <nav {...rest} ref={(n) => (el = n)} data-scope="nav" data-axis={axis} aria-label={label}>
      {children}
      <span
        data-part="indicator"
        aria-hidden="true"
        style={axis === 'x' ? `view-transition-name:${barName(label)}` : undefined}
      ></span>
    </nav>
  )
}
