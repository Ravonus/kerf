import { createSignal, onCleanup, Match, Switch } from 'solid-js'
import Settings from './pages/Settings'
import Customers from './pages/Customers'
import Pricing from './pages/Pricing'

const links = [
  ['Settings', '#/settings'],
  ['Customers', '#/customers'],
  ['Pricing', '#/pricing'],
] as const

export function App() {
  const read = () => (location.hash.startsWith('#/') ? location.hash : '#/settings')
  const [route, setRoute] = createSignal(read())
  const on = () => setRoute(read())
  window.addEventListener('hashchange', on)
  onCleanup(() => window.removeEventListener('hashchange', on))

  return (
    <div class="min-h-screen">
      <header class="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div class="mx-auto flex max-w-6xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-8 sm:px-6">
          <span class="text-lg font-bold tracking-tight text-indigo-700 dark:text-indigo-300">
            Northwind
          </span>
          <nav aria-label="Main">
            <ul class="-mx-2 flex gap-1">
              {links.map(([label, href]) => (
                <li>
                  <a
                    href={href}
                    aria-current={route() === href ? 'page' : undefined}
                    class="block rounded-md px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-100 aria-[current=page]:bg-indigo-50 aria-[current=page]:text-indigo-800 focus-visible:outline-2 focus-visible:outline-indigo-600 dark:text-slate-300 dark:hover:bg-slate-800 dark:aria-[current=page]:bg-slate-800 dark:aria-[current=page]:text-white"
                  >
                    {label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </header>
      <main class="mx-auto max-w-6xl px-4 py-8 sm:px-6 sm:py-12">
        <Switch fallback={<Settings />}>
          <Match when={route() === '#/customers'}>
            <Customers />
          </Match>
          <Match when={route() === '#/pricing'}>
            <Pricing />
          </Match>
        </Switch>
      </main>
    </div>
  )
}
