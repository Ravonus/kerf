import { derived, resource, state, watch } from '@weft-js/core'
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

  watch(
    () => api,
    (source) => {
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
    },
  )

  watch(
    () => ({ tab: tab.value, views: views.value }),
    (v) => localStorage.setItem(VIEW_KEY, JSON.stringify(v)),
  )

  const view = derived(() => views.value[tab.value])
  const setView = (patch: Partial<View>) =>
    (views.value = { ...views.value, [tab.value]: { ...view.value, ...patch } })
  const favoritesOnly = derived(() => view.value.favoritesOnly)
  const sortBy = derived(() => view.value.sort)

  // One search per tab, started the first time the tab is shown and kept from then on: switching away neither
  // aborts nor hides its request. Each reads only its own tab's entries, so typing in one tab leaves the others be.
  // One search for whichever tab is shown.
  const term = derived(() => view.value.query.trim())
  const current = resource((signal) =>
    term.value ? api.search(term.value, signal).then((ids) => new Set(ids)) : null,
  )
  const search = derived(() => current)
  const selectTab = (t: Tab) => {
    tab.value = t
  }

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

  // Clicks per star, so a failed save only reverts its star if nothing clicked it since.
  const clicks: Record<string, number> = {}
  const toggle = (stock: Stock) => {
    const before = !!favorites.value[stock.id]
    const click = (clicks[stock.id] = (clicks[stock.id] ?? 0) + 1)
    favorites.value = { ...favorites.value, [stock.id]: !before }
    api.setFavorite(stock.id, !before).catch(() => {
      if (clicks[stock.id] === click) favorites.value = { ...favorites.value, [stock.id]: before }
      alert.value = `Couldn't update ${stock.symbol}`
    })
  }

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
