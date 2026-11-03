import { state } from '@weft-js/core'
import { on } from '@weft-js/core/browser'
import { Settings } from './Settings'
import { Customers } from './Customers'
import { Pricing } from './Pricing'

const links = [
  ['settings', 'Settings'],
  ['customers', 'Customers'],
  ['pricing', 'Pricing'],
] as const

const read = () => {
  const r = location.hash.replace(/^#\/?/, '')
  return links.some(l => l[0] === r) ? r : 'settings'
}

export function App() {
  const route = state(read())
  on(window, 'hashchange', () => { route.value = read() })

  return (
    <div class="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <header class="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div class="mx-auto flex max-w-5xl flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <span class="text-lg font-bold tracking-tight text-indigo-600 dark:text-indigo-400">Northwind</span>
          <nav aria-label="Main" class="-mx-2 flex gap-1">
            {links.map(([id, label]) => (
              <a
                key={id}
                href={`#/${id}`}
                aria-current={route.value === id ? 'page' : undefined}
                class="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 aria-[current=page]:bg-indigo-50 aria-[current=page]:text-indigo-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:aria-[current=page]:bg-indigo-950 dark:aria-[current=page]:text-indigo-300"
              >
                {label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main class="mx-auto max-w-5xl px-4 py-8 sm:py-10">
        {route.value === 'customers' ? <Customers /> : route.value === 'pricing' ? <Pricing /> : <Settings />}
      </main>
    </div>
  )
}
