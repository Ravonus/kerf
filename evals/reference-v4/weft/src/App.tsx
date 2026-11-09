import { derived, resource, state, watch, type State } from '@weft-js/core'
import type { Api, Holding, Sector, Stock } from './api'
import { DetailsPanel } from './components/DetailsPanel'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { Toolbar } from './components/Toolbar'

export type Live = { price: number; history: number[] }
export type Tab = 'All' | Sector
export type View = { query: string; favoritesOnly: boolean; sort: 'symbol' | 'change' }
type Saved = { tab: Tab; views: Record<Tab, View> }
type Save = { id: string; prev: string }

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
  const d = appState()

  bindStocks({ api: () => api, ...d })

  bindSaved(d.tab, d.views)

  const { view, setView, favoritesOnly, sortBy } = createView(d.tab, d.views)

  const { search, selectTab } = createSearch({ api: () => api, initialTab: d.saved.tab, ...d })

  const { shown, portfolio } = createResults({ ...d, view, search, favoritesOnly, sortBy })

  const toggle = favoriteActions(() => api, d.favorites, d.alert)

  const { openDetails, closeDetails, opened, save, undo } = detailActions(d)

  return (
    <>
      {!d.stocks.value ? (
        <p>Loading…</p>
      ) : (
        <div>
          <Header count={shown.value.length} portfolio={portfolio.value} />
          <nav>
            {TABS.map((t) => (
              <button aria-pressed={t === d.tab.value} onClick={() => selectTab(t)}>
                {t}
              </button>
            ))}
          </nav>
          <Toolbar view={view.value} onView={setView} />
          <p role="status">{search.value.pending ? 'Searching…' : ''}</p>
          {!search.value.pending && search.value.error !== undefined && (
            <p role="alert">Search failed</p>
          )}
          {d.alert.value && <p role="alert">{d.alert.value}</p>}
          <StockList
            stocks={shown.value}
            live={d.live}
            favorites={d.favorites}
            onToggle={toggle}
            onDetails={openDetails}
          />
          {opened.value.map((s) => (
            <DetailsPanel
              key={s.id}
              api={api}
              stock={s}
              price={d.live.get(s.id).price}
              note={d.notes.get(s.id) ?? ''}
              canUndo={d.saves.value.length > 0}
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

function bindStocks({
  api,
  stocks,
  holdings,
  live,
  favorites,
}: {
  api: () => Api
  stocks: State<Stock[] | null>
  holdings: State<Holding[]>
  live: State<Record<string, Live>>
  favorites: State<Record<string, boolean>>
}) {
  watch(api, (source) => {
    let alive = true
    Promise.all([source.listStocks(), source.listHoldings()]).then(([list, held]) => {
      if (!alive) return
      live.value = Object.fromEntries(
        list.map((s) => [s.id, { price: s.price, history: [s.price] }]),
      )
      favorites.value = Object.fromEntries(list.map((s) => [s.id, s.favorite]))
      holdings.value = held
      stocks.value = list
    })
    const unsubscribe = source.subscribeQuotes(({ id, price }) => {
      const now = live.value[id]
      if (now)
        live.value = {
          ...live.value,
          [id]: { price, history: [...now.history, price].slice(-20) },
        }
    })
    return () => {
      alive = false
      unsubscribe()
    }
  })
}
function bindSaved(tab: State<Tab>, views: State<Record<Tab, View>>) {
  watch(
    () => ({ tab: tab.value, views: views.value }),
    (v) => localStorage.setItem(VIEW_KEY, JSON.stringify(v)),
  )
}
function createSearch({
  api,
  initialTab,
  tab,
  views,
}: {
  api: () => Api
  initialTab: Tab
  tab: State<Tab>
  views: State<Record<Tab, View>>
}) {
  // One search per tab, started the first time the tab is shown and kept from then on: switching away neither
  // aborts nor hides its request. Each reads only its own tab's entries, so typing in one tab leaves the others be.
  const visited = state<Partial<Record<Tab, true>>>({ [initialTab]: true })
  const searchFor = (t: Tab) => {
    const term = derived(() => views.get(t).query.trim())
    return resource((signal) =>
      visited.get(t) && term.value
        ? api()
            .search(term.value, signal)
            .then((ids) => new Set(ids))
        : null,
    )
  }
  const searches = Object.fromEntries(TABS.map((t) => [t, searchFor(t)])) as Record<
    Tab,
    ReturnType<typeof searchFor>
  >
  const search = derived(() => searches[tab.value])
  const selectTab = (t: Tab) => {
    if (!visited.value[t]) visited.value = { ...visited.value, [t]: true }
    tab.value = t
  }

  return { search, selectTab }
}
function createResults({
  stocks,
  holdings,
  live,
  favorites,
  tab,
  view,
  search,
  favoritesOnly,
  sortBy,
}: {
  stocks: State<Stock[] | null>
  holdings: State<Holding[]>
  live: State<Record<string, Live>>
  favorites: State<Record<string, boolean>>
  tab: State<Tab>
  view: { readonly value: View }
  search: ReturnType<typeof createSearch>['search']
  favoritesOnly: { readonly value: boolean }
  sortBy: { readonly value: View['sort'] }
}) {
  // Rows keep their identity (the loaded Stock objects), so the list only adds, removes and moves rows.
  const filtered = derived(() => {
    const t = tab.value
    const ids = search.value.value
    return (stocks.value ?? []).filter(
      (s) =>
        (t === 'All' || s.sector === t) &&
        (!ids || ids.has(s.id)) &&
        (!favoritesOnly.value || favorites.value[s.id]),
    )
  })
  // Only the Change sort reads prices, so quotes don't re-sort a Symbol list. Array#sort is stable: ties keep list order.
  const shown = derived(() => {
    const rows = filtered.value
    if (sortBy.value !== 'change') return rows
    const change = new Map(
      rows.map((s) => [s, (live.value[s.id].price - s.prevClose) / s.prevClose]),
    )
    return [...rows].sort((a, b) => change.get(b)! - change.get(a)!)
  })
  const portfolio = derived(() =>
    holdings.value.reduce((sum, h) => sum + h.qty * (live.get(h.id)?.price ?? 0), 0),
  )

  return { shown, portfolio }
}
function favoriteActions(
  api: () => Api,
  favorites: State<Record<string, boolean>>,
  alert: State<string | null>,
) {
  // Clicks per star, so a failed save only reverts its star if nothing clicked it since.
  const clicks: Record<string, number> = {}
  const toggle = (stock: Stock) => {
    const before = !!favorites.value[stock.id]
    const click = (clicks[stock.id] = (clicks[stock.id] ?? 0) + 1)
    favorites.value = { ...favorites.value, [stock.id]: !before }
    api()
      .setFavorite(stock.id, !before)
      .catch(() => {
        if (clicks[stock.id] === click) favorites.value = { ...favorites.value, [stock.id]: before }
        alert.value = `Couldn't update ${stock.symbol}`
      })
  }

  return toggle
}
function detailActions({
  stocks,
  openId,
  notes,
  saves,
}: {
  stocks: State<Stock[] | null>
  openId: State<string | null>
  notes: State<Record<string, string>>
  saves: State<Save[]>
}) {
  const opener: { button?: HTMLElement } = {}
  const openDetails = (id: string, button: HTMLElement) => {
    opener.button = button
    openId.value = id
  }
  const closeDetails = () => {
    opener.button?.focus()
    openId.value = null
  }
  // A keyed list of at most one: opening another stock mounts a fresh panel (its own load, draft and focus).
  const opened = derived(() => (stocks.value ?? []).filter((s) => s.id === openId.value))

  const save = (id: string, text: string) => {
    saves.value = [...saves.value, { id, prev: notes.value[id] ?? '' }]
    notes.value = { ...notes.value, [id]: text }
  }
  const undo = () => {
    const last = saves.value.at(-1)
    if (!last) return
    saves.value = saves.value.slice(0, -1)
    notes.value = { ...notes.value, [last.id]: last.prev }
  }

  return { openDetails, closeDetails, opened, save, undo }
}

function appState() {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const live = state<Record<string, Live>>({})
  const favorites = state<Record<string, boolean>>({})
  const saved = loadSaved()
  const tab = state<Tab>(saved.tab)
  const views = state<Record<Tab, View>>(saved.views)
  const alert = state<string | null>(null)
  const openId = state<string | null>(null)
  const notes = state<Record<string, string>>({})
  const saves = state<Save[]>([])
  return { stocks, holdings, live, favorites, saved, tab, views, alert, openId, notes, saves }
}

function createView(tab: State<Tab>, views: State<Record<Tab, View>>) {
  const view = derived(() => views.value[tab.value])
  const setView = (patch: Partial<View>) =>
    (views.value = { ...views.value, [tab.value]: { ...view.value, ...patch } })
  const favoritesOnly = derived(() => view.value.favoritesOnly)
  const sortBy = derived(() => view.value.sort)

  return { view, setView, favoritesOnly, sortBy }
}
