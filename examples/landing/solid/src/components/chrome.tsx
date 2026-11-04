import { A } from '@solidjs/router'

import { primary } from './button'

export const Logo = () => (
  <A
    href="/"
    end
    class="flex items-center gap-2 text-lg font-bold tracking-tight"
    aria-label="Emberline home"
  >
    <span
      aria-hidden="true"
      class="size-5 rounded-full bg-linear-to-br from-orange-300 to-accent"
    />
    Emberline
  </A>
)

const link = 'rounded-lg px-3 py-2 text-muted transition-colors hover:text-ink'

export function SiteHeader() {
  return (
    <header class="sticky top-0 z-10 border-b border-line bg-page/90 backdrop-blur">
      <div class="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav aria-label="Main" class="flex items-center gap-1 text-[0.95rem] font-medium">
          <A href="/pricing" class={link} activeClass="text-ink" inactiveClass="">
            Pricing
          </A>
          <A href="/privacy" class={link} activeClass="text-ink" inactiveClass="">
            Privacy
          </A>
          <A
            href="/#join"
            class={`${primary} ml-2 min-h-10 max-sm:hidden`}
            activeClass=""
            inactiveClass=""
          >
            Get early access
          </A>
        </nav>
      </div>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer class="border-t border-line">
      <div class="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-8 text-sm text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <div>
          <A href="/" class="font-semibold text-ink" activeClass="" inactiveClass="">
            Emberline
          </A>
          <p class="mt-1">Hear what customers keep asking for.</p>
          <p class="mt-3 text-xs">© 2026 Emberline. Built for teams that listen.</p>
        </div>
        <nav aria-label="Footer" class="flex flex-wrap gap-5">
          <A href="/pricing" class="hover:text-ink" activeClass="" inactiveClass="">
            Pricing
          </A>
          <A href="/privacy" class="hover:text-ink" activeClass="" inactiveClass="">
            Privacy
          </A>
          <a href="mailto:hello@emberline.example" class="hover:text-ink">
            hello@emberline.example
          </a>
        </nav>
      </div>
    </footer>
  )
}
