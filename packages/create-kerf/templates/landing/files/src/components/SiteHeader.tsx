import { Link } from '@kerf/start'

// Plain elements, not veneer's Center and Row: nothing here runs, so nothing here has to ship.
export function SiteHeader() {
  return (
    <header class="site-head">
      <div class="wrap site-bar">
        <Link href="/" class="brand">
          Emberline
        </Link>
        <div class="site-links">
          <nav aria-label="Main">
            <Link href="/pricing">Pricing</Link>
            <Link href="/privacy">Privacy</Link>
          </nav>
          <Link href="/#join" class="cta" data-size="sm">
            Get early access
          </Link>
        </div>
      </div>
    </header>
  )
}
