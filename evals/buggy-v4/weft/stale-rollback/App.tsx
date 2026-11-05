import type { Api, Sector } from './api'
import { DetailsPanel } from './components/DetailsPanel'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { Toolbar } from './components/Toolbar'
import { appModel } from './AppModel'

export type Live = { price: number; history: number[] }
export type Tab = 'All' | Sector
export type View = { query: string; favoritesOnly: boolean; sort: 'symbol' | 'change' }
type Saved = { tab: Tab; views: Record<Tab, View> }

const TABS: Tab[] = ['All', 'tech', 'energy', 'health', 'finance']
const VIEW_KEY = 'watchlist:view'
const blank: View = { query: '', favoritesOnly: false, sort: 'symbol' }
function loadSaved(): Saved {
  const views = Object.fromEntries(TABS.map((t) => [t, blank])) as Record<Tab, View>
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}')
    for (const t of TABS) views[t] = { ...blank, ...saved.views?.[t] }
    return { tab: TABS.includes(saved.tab) ? saved.tab : 'All', views }
  } catch {
    return { tab: 'All', views }
  }
}

export function App({ api }: { api: Api }) {
  const {
    stocks,
    live,
    favorites,
    tab,
    alert,
    notes,
    saves,
    view,
    setView,
    search,
    selectTab,
    shown,
    portfolio,
    toggle,
    openDetails,
    closeDetails,
    opened,
    save,
    undo,
  } = appModel(() => api, loadSaved, TABS, VIEW_KEY)

  return (
    <>
      {!stocks.value ? (
        <p>Loading…</p>
      ) : (
        <div>
          <Header count={shown.value.length} portfolio={portfolio.value} />
          <nav>
            {TABS.map((t) => (
              <button aria-pressed={t === tab.value} onClick={() => selectTab(t)}>
                {t}
              </button>
            ))}
          </nav>
          <Toolbar view={view.value} onView={setView} />
          <p role="status">{search.value.pending ? 'Searching…' : ''}</p>
          {!search.value.pending && search.value.error !== undefined && (
            <p role="alert">Search failed</p>
          )}
          {alert.value && <p role="alert">{alert.value}</p>}
          <StockList
            stocks={shown.value}
            live={live}
            favorites={favorites}
            onToggle={toggle}
            onDetails={openDetails}
          />
          {opened.value.map((s) => (
            <DetailsPanel
              key={s.id}
              api={api}
              stock={s}
              price={live.get(s.id).price}
              note={notes.get(s.id) ?? ''}
              canUndo={saves.value.length > 0}
              onSave={save}
              onUndo={undo}
              onClose={closeDetails}
            />
          ))}
        </div>
      )}
    </>
  )
}
