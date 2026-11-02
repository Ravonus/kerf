import { navIndicator } from '@weft-js/warp-core'
import { use } from '@weft-js/warp-core/weft'
import './styles'
import '@weft-js/warp-core/styles/components/nav.css'

/**
 * Links with warp's sliding bar. It grows in from an item's edge, slides as the route or the pointer moves, and grows
 * out through the far edge. Mark the current link with `aria-current` (`Link` from `@weft-js/start` does). `spy` follows
 * the headings of a table of contents. The bar is on the current link in the server's HTML, so nothing moves on load.
 */
export function Nav({ label, axis = 'x', spy, children, ...rest }: { label: string; axis?: 'x' | 'y'; spy?: boolean; children?: any; [attr: string]: any }) {
  let el: HTMLElement | undefined
  use(navIndicator, () => el, () => ({ axis, spy }))
  return (
    <nav {...rest} ref={(n: any) => (el = n)} data-scope="nav" data-axis={axis} aria-label={label}>
      {children}
      <span data-part="indicator" aria-hidden="true"></span>
    </nav>
  )
}
