import { Link } from '@weft/start'

export function SiteFooter() {
  return (
    <footer class="site-foot">
      <div class="wrap">
        <div class="site-bar">
          <div class="site-foot-brand">
            <Link href="/" class="brand">Emberline</Link>
            <p>Hear what customers keep asking for.</p>
          </div>
          <nav aria-label="Footer">
            <Link href="/pricing">Pricing</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="mailto:hello@emberline.example">hello@emberline.example</Link>
          </nav>
        </div>
        <p class="site-foot-legal">© 2026 Emberline. Built for teams that listen.</p>
      </div>
    </footer>
  )
}
