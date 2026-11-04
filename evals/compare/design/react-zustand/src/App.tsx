import { useEffect, useSyncExternalStore } from 'react'
import { Customers } from './Customers'
import { Pricing } from './Pricing'
import { Settings } from './Settings'

const routes = [
  { path: '/settings', label: 'Settings', Page: Settings },
  { path: '/customers', label: 'Customers', Page: Customers },
  { path: '/pricing', label: 'Pricing', Page: Pricing },
]

const subscribe = (cb: () => void) => {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}
const getHash = () => window.location.hash.slice(1)

export function App() {
  const hash = useSyncExternalStore(subscribe, getHash)
  const route = routes.find((r) => r.path === hash) ?? routes[0]

  useEffect(() => {
    document.title = `${route.label} · Northwind`
  }, [route])

  return (
    <div className="min-h-screen">
      <div className="border-b border-slate-200 bg-white/80 backdrop-blur dark:border-slate-800 dark:bg-slate-950/80">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <span className="flex items-center gap-2 text-lg font-semibold tracking-tight">
            <span
              aria-hidden
              className="grid size-7 place-items-center rounded-lg bg-indigo-600 text-sm text-white"
            >
              N
            </span>
            Northwind
          </span>
          <nav aria-label="Main">
            <ul className="flex gap-1">
              {routes.map((r) => (
                <li key={r.path}>
                  <a
                    href={`#${r.path}`}
                    aria-current={r === route ? 'page' : undefined}
                    className="inline-flex min-h-10 items-center rounded-lg px-3 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 aria-[current=page]:bg-indigo-50 aria-[current=page]:text-indigo-700 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100 dark:aria-[current=page]:bg-indigo-950 dark:aria-[current=page]:text-indigo-300"
                  >
                    {r.label}
                  </a>
                </li>
              ))}
            </ul>
          </nav>
        </div>
      </div>
      <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-12">
        <route.Page />
      </main>
    </div>
  )
}
