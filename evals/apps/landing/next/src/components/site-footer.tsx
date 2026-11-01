import Link from 'next/link'

export function SiteFooter() {
  return (
    <footer className="mt-24 border-t border-line">
      <div className="mx-auto flex max-w-6xl flex-col justify-between gap-3 px-4 py-8 text-sm text-muted sm:flex-row sm:px-6">
        <div>
          <Link href="/" className="font-semibold text-ink">Emberline</Link>
          <p className="mt-1">Hear what customers keep asking for.</p>
          <p className="mt-3 text-xs">© 2026 Emberline. Built for teams that listen.</p>
        </div>
        <nav aria-label="Footer" className="flex flex-wrap gap-5">
          <Link href="/pricing" className="hover:text-ink">Pricing</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <a href="mailto:hello@emberline.example" className="hover:text-ink">hello@emberline.example</a>
        </nav>
      </div>
    </footer>
  )
}
