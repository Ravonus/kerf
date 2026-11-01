import { Link } from '@weft/start'
import { CartLink } from '#/components/CartLink'
import { Logo } from '#/components/Logo'

// Plain elements, not warp's Center and Row: wrapped in those, the cart count becomes part of an island that waits for a click.
export function SiteHeader() {
  return (
    <header class="site-head">
      <Link href="/" class="brand"><Logo />Mendwell</Link>
      <CartLink />
    </header>
  )
}
