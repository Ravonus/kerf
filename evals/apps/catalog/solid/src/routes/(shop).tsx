import { useIsRouting, type RouteDefinition, type RouteSectionProps } from "@solidjs/router";
import { Show, Suspense } from "solid-js";

import { CartLink } from "~/components/cart-link";
import { Guarded } from "~/components/states";
import { getCartCount } from "~/lib/data";

// In the layout's preload so every page's action replies can carry the count.
export const route = { preload: () => void getCartCount() } satisfies RouteDefinition;

export default function Shop(props: RouteSectionProps) {
  const routing = useIsRouting();
  return (
    <>
      <div aria-hidden="true" class="fixed inset-x-0 top-0 z-30 h-0.5 overflow-hidden">
        <Show when={routing()}>
          <div class="routing h-full bg-accent" />
        </Show>
      </div>
      <header class="sticky top-0 z-20 border-b border-line/70 bg-page/90 backdrop-blur">
        <div class="mx-auto flex h-14 max-w-6xl items-center justify-between px-4 sm:px-6">
          <a href="/" class="font-display text-xl font-semibold tracking-tight">
            Commonplace
          </a>
          <CartLink />
        </div>
      </header>
      <main class="mx-auto min-h-[70dvh] max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
        <Guarded>
          <Suspense>{props.children}</Suspense>
        </Guarded>
      </main>
      <footer class="border-t border-line">
        <p class="mx-auto max-w-6xl px-4 py-6 text-sm text-muted sm:px-6">Made to be used every day, and repaired when it wears.</p>
      </footer>
    </>
  );
}
