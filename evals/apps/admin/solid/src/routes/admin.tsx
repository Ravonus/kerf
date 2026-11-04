import {
  A,
  createAsync,
  Navigate,
  useIsRouting,
  type RouteDefinition,
  type RouteSectionProps,
} from '@solidjs/router'
import { For, Show, Suspense } from 'solid-js'

import { AccountMenu } from '~/components/account-menu'
import { Loads } from '~/components/states'
import { Logo } from '~/components/logo'
import { getViewer } from '~/lib/data'

export const route = { preload: () => void getViewer() } satisfies RouteDefinition

const links = [
  { href: '/admin', label: 'Overview', end: true },
  { href: '/admin/orders', label: 'Orders' },
  { href: '/admin/nested', label: 'Regions' },
  { href: '/admin/per-row', label: 'Order feed' },
  { href: '/admin/slow', label: 'Year report' },
]

export default function AdminLayout(props: RouteSectionProps) {
  const viewer = createAsync(() => getViewer())
  const routing = useIsRouting()

  return (
    <>
      {/* The middleware turned away anyone with no cookie, so the shell is already out. A cookie that no longer stands is caught here. */}
      <Suspense>
        <Show when={viewer() === null}>
          <Navigate href="/login" />
        </Show>
      </Suspense>
      <div aria-hidden="true" class="fixed inset-x-0 top-0 z-30 h-0.5 overflow-hidden">
        <Show when={routing()}>
          <div class="routing h-full bg-accent" />
        </Show>
      </div>
      <div class="mx-auto min-h-dvh max-w-7xl lg:grid lg:grid-cols-[13rem_minmax(0,1fr)]">
        <aside class="sticky top-0 z-10 border-b border-line/70 bg-page/90 backdrop-blur lg:h-dvh lg:border-r lg:border-b-0 lg:bg-transparent">
          <div class="flex h-14 items-center justify-between px-4 lg:h-20 lg:px-5">
            <a href="/admin">
              <Logo />
            </a>
            <div class="lg:hidden">
              <Account viewer={viewer()} />
            </div>
          </div>
          <nav aria-label="Admin" class="flex gap-1 overflow-x-auto px-3 pb-2 lg:flex-col lg:pb-0">
            <For each={links}>
              {(link) => (
                <A
                  href={link.href}
                  end={link.end}
                  activeClass=""
                  inactiveClass=""
                  class="rounded-lg px-3 py-2 text-sm font-medium whitespace-nowrap text-muted transition-colors hover:text-ink aria-[current=page]:bg-sunken aria-[current=page]:text-accent-text"
                >
                  {link.label}
                </A>
              )}
            </For>
          </nav>
          <div class="absolute bottom-5 left-5 hidden lg:block">
            <Account viewer={viewer()} />
          </div>
        </aside>
        <main class="min-w-0 px-4 py-6 sm:px-6 lg:px-8 lg:py-8">
          <Loads what="This page">{props.children}</Loads>
        </main>
      </div>
    </>
  )
}

function Account(props: { viewer?: { name: string; email: string } | null }) {
  return (
    <Suspense fallback={<span class="block size-9 rounded-full bg-sunken" />}>
      <Show when={props.viewer}>
        {(user) => <AccountMenu name={user().name} email={user().email} />}
      </Show>
    </Suspense>
  )
}
