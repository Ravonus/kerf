import { useEffect, useState } from 'react'
import { Customers } from './Customers'
import { Pricing } from './Pricing'
import { Settings } from './Settings'

const routes = [
  { path: '/settings', label: 'Settings', Page: Settings },
  { path: '/customers', label: 'Customers', Page: Customers },
  { path: '/pricing', label: 'Pricing', Page: Pricing },
]

const current = () => window.location.hash.replace(/^#/, '') || '/settings'

export function App() {
  const [path, setPath] = useState(current)
  useEffect(() => {
    const on = () => setPath(current())
    window.addEventListener('hashchange', on)
    return () => window.removeEventListener('hashchange', on)
  }, [])
  const route = routes.find((r) => r.path === path) ?? routes[0]

  return (
    <div className="min-h-screen">
      <header className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-900/80">
        <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-x-8 gap-y-2 px-4 py-3 sm:px-6">
          <span className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <span aria-hidden className="grid size-7 place-items-center rounded-lg bg-brand-600 text-sm text-white">N</span>
            Northwind
          </span>
          <nav aria-label="Main" className="-mx-2 flex gap-1">
            {routes.map((r) => (
              <a
                key={r.path}
                href={`#${r.path}`}
                aria-current={r.path === route.path ? 'page' : undefined}
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 focus-visible:outline-2 focus-visible:outline-brand-500 aria-[current=page]:bg-brand-50 aria-[current=page]:text-brand-700 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white dark:aria-[current=page]:bg-slate-800 dark:aria-[current=page]:text-brand-100"
              >
                {r.label}
              </a>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <route.Page />
      </main>
    </div>
  )
}
