import { Meta } from '@solidjs/meta'
import { useIsRouting, type RouteDefinition, type RouteSectionProps } from '@solidjs/router'
import { Show, Suspense } from 'solid-js'

import { CartLink } from '~/components/cart-link'
import { Guarded } from '~/components/states'
import { getCartCount } from '~/lib/data'

// In the layout's preload so every page's action replies can carry the count.
export const route = { preload: () => void getCartCount() } satisfies RouteDefinition

export default function Shop(props: RouteSectionProps) {
  const routing = useIsRouting()
  return (
    <div class="flex min-h-dvh flex-col">
      <Meta
        name="description"
        content="Mendwell sells everyday goods made to be used hard and repaired when they wear."
      />
      <div aria-hidden="true" class="fixed inset-x-0 top-0 z-30 h-0.5 overflow-hidden">
        <Show when={routing()}>
          <div class="routing h-full bg-accent" />
        </Show>
      </div>
      <header class="sticky top-0 z-20 border-b border-line bg-page">
        <div class="mx-auto flex max-w-360 items-center justify-between gap-5 px-8 py-2.5">
          <a href="/" class="inline-flex items-center gap-1.5 text-xl font-semibold">
            <svg class="size-7 flex-none" viewBox="0 0 32 32" aria-hidden="true">
              <circle cx="16" cy="16" r="16" fill="var(--accent)" />
              <path
                d="M8 23V10l8 8 8-8v13"
                fill="none"
                stroke="var(--accent-ink)"
                stroke-width="3"
                stroke-linecap="round"
                stroke-linejoin="round"
              />
            </svg>
            Mendwell
          </a>
          <CartLink />
        </div>
      </header>
      <main class="flex-1">
        <Guarded>
          <Suspense>{props.children}</Suspense>
        </Guarded>
      </main>
      <footer class="mt-8 border-t border-line">
        <div class="mx-auto flex max-w-360 flex-wrap justify-between gap-2.5 px-8 py-5 text-muted">
          <p>Mendwell. Goods made to be used hard and fixed when they wear.</p>
          <p>Free repairs for the first ten years.</p>
        </div>
      </footer>
    </div>
  )
}
