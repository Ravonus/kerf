import { For } from 'solid-js'

import { ButtonLink, Container } from '~/components/ui'
import { Menu, X } from '~/components/ui/icons'
import { Logo } from './logo'

const NAV = [
  ['How it works', '/#how'],
  ['Meet Lemon', '/#coach'],
  ['Programs', '/#programs'],
  ['Safety', '/#safety'],
  ['FAQ', '/#faq'],
] as const

const NAV_ALL = [...NAV, ['Contact', '/#contact']] as const

const LEGAL = [
  ['Privacy policy', '/privacy'],
  ['Terms of use', '/terms'],
  ['Safety & privacy overview', '/#safety'],
] as const

export function SkipLink() {
  return (
    <a
      href="#main"
      class="sr-only z-50 rounded-control bg-navy px-4 py-3 font-semibold text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
    >
      Skip to content
    </a>
  )
}

export function SiteHeader() {
  return (
    <header class="sticky top-0 z-40 border-b border-line bg-bg/85 backdrop-blur-md supports-[backdrop-filter]:bg-bg/75">
      <Container class="flex h-16 items-center justify-between gap-4 sm:h-18">
        <a href="/" aria-label="Lemonstand home" class="-m-1 rounded-control p-1">
          <Logo />
        </a>
        <nav aria-label="Main" class="hidden lg:block">
          <ul class="flex items-center gap-1">
            <For each={NAV}>
              {(link) => (
                <li>
                  <a
                    href={link[1]}
                    class="inline-flex min-h-11 items-center rounded-control px-3 text-[0.95rem] font-medium text-muted transition-colors hover:text-ink"
                  >
                    {link[0]}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </nav>
        <div class="flex shrink-0 items-center gap-2">
          <span class="hidden sm:block">
            <ButtonLink href="/#contact" variant="ghost">
              Contact
            </ButtonLink>
          </span>
          <ButtonLink href="/#join" variant="primary" class="px-3.5 sm:px-4.5">
            <span class="sm:hidden">Join</span>
            <span class="hidden sm:inline">Join the waitlist</span>
          </ButtonLink>
          {/* No-JS mobile menu */}
          <details class="group relative lg:hidden">
            <summary
              aria-label="Menu"
              class="grid size-11 cursor-pointer place-items-center rounded-control text-ink ring-1 ring-line hover:bg-sunken"
            >
              <Menu class="size-5 group-open:hidden" />
              <X class="hidden size-5 group-open:block" />
            </summary>
            <nav
              aria-label="Mobile"
              class="absolute top-full right-0 mt-2 w-60 rounded-card bg-surface p-2 shadow-pop ring-1 ring-line"
            >
              <ul>
                <For each={NAV_ALL}>
                  {(link) => (
                    <li>
                      <a
                        href={link[1]}
                        class="flex min-h-11 items-center rounded-control px-3 font-medium hover:bg-sunken"
                      >
                        {link[0]}
                      </a>
                    </li>
                  )}
                </For>
              </ul>
            </nav>
          </details>
        </div>
      </Container>
    </header>
  )
}

export function SiteFooter() {
  return (
    <footer class="border-t border-line bg-surface">
      <Container class="grid gap-10 py-14 md:grid-cols-[1.4fr_1fr_1fr]">
        <div class="max-w-sm">
          <Logo />
          <p class="mt-4 text-[0.95rem] leading-relaxed text-muted">
            Entrepreneurship for young people ages 8–18, with an AI coach that asks good questions
            and lets kids do the work.
          </p>
        </div>
        <nav aria-label="Footer">
          <p class="text-eyebrow font-semibold text-muted uppercase">Explore</p>
          <ul class="mt-4 grid gap-1">
            <For each={NAV_ALL}>
              {(link) => (
                <li>
                  <a
                    href={link[1]}
                    class="inline-flex min-h-11 items-center text-ink/85 hover:text-ink sm:min-h-9"
                  >
                    {link[0]}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </nav>
        <nav aria-label="Legal">
          <p class="text-eyebrow font-semibold text-muted uppercase">Trust</p>
          <ul class="mt-4 grid gap-1">
            <For each={LEGAL}>
              {(link) => (
                <li>
                  <a
                    href={link[1]}
                    class="inline-flex min-h-11 items-center text-ink/85 hover:text-ink sm:min-h-9"
                  >
                    {link[0]}
                  </a>
                </li>
              )}
            </For>
          </ul>
        </nav>
      </Container>
      <Container class="flex flex-col gap-2 border-t border-line py-6 text-sm text-muted sm:flex-row sm:justify-between">
        <p>© {new Date().getFullYear()} Lemonstand.ai</p>
        <p>No ads. We never sell student data.</p>
      </Container>
    </footer>
  )
}
