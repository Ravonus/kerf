import Link from 'next/link'
import { Logo } from './logo'

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-10 border-b border-line/70 bg-paper/85 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Link href="/" className="flex items-center gap-2.5 text-lg font-semibold tracking-tight">
          <Logo />
          Emberline
        </Link>
        <nav aria-label="Main" className="flex items-center gap-1 text-sm font-medium sm:gap-3">
          <Link href="/pricing" className="rounded-lg px-3 py-2 text-muted transition-colors hover:text-ink">Pricing</Link>
          <Link href="/privacy" className="rounded-lg px-3 py-2 text-muted transition-colors hover:text-ink">Privacy</Link>
          <Link href="/#join" className="hidden rounded-lg border border-line px-3.5 py-2 transition-colors hover:border-ink sm:block">Get early access</Link>
        </nav>
      </div>
    </header>
  )
}
