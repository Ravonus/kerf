import { navIndicator } from '@weft-js/warp-core'
import { use } from '@weft-js/warp-core/weft'
import type { ThemeTone } from './theme-tone'
import './styles'
import '@weft-js/warp-core/styles/components/nav.css'

/**
 * Links with warp's sliding bar. It grows in from an item's edge, slides as the route or the pointer moves, and grows
 * out through the far edge. Mark the current link with `aria-current` (`Link` from `@weft-js/start` does). `spy` follows
 * the headings of a table of contents. The bar is on the current link in the server's HTML, so nothing moves on load.
 */
export function Nav({
  label,
  tone,
  axis = 'x',
  spy,
  children,
  ...rest
}: {
  label: string
  tone?: ThemeTone | undefined
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
    <nav
      {...rest}
      ref={(n) => (el = n)}
      data-scope="nav"
      data-tone={tone}
      data-axis={axis}
      aria-label={label}
    >
      {children}
      <span data-part="indicator" aria-hidden="true"></span>
    </nav>
  )
}
