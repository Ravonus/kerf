import { derived, state, watch } from 'weft'
import type { Api, Holding, Quotes, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { stored, store } from './lib/storage'

/** Prices kept per stock for its sparkline. */
const HISTORY = 20

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const quotes = state<Quotes>({})
  const portfolio = derived(() => holdings.value.reduce((sum, h) => sum + h.qty * (quotes.get(h.id)?.price ?? 0), 0))

  // Favorites. `clicks` counts each stock's clicks, so a failed save only reverts if no later click happened.
  const favorites = state<Record<string, boolean>>({})
  const favoriteError = state<string | null>(null)
  const clicks = new Map<string, number>()

  // Search and filter. `matches` is the latest answer (null: no search, show every stock).
  const query = state(stored('watchlist.search', ''))
  const favoritesOnly = state(stored('watchlist.favoritesOnly', 'false') === 'true')
  const trimmed = derived(() => query.value.trim())
  const matches = state<string[] | null>(null)
  const searching = state(false)
  const searchFailed = state(false)
  const shown = derived((): Stock[] => {
    const all = stocks.value
    if (!all) return []
    const ids = matches.value
    const keep = ids === null ? null : new Set(ids)
    return all.filter(s => (keep === null || keep.has(s.id)) && (!favoritesOnly.value || favorites.get(s.id)))
  })

  watch(() => query.value, q => store('watchlist.search', q))
  watch(() => favoritesOnly.value, on => store('watchlist.favoritesOnly', String(on)))

  watch(() => api, source => {
    let live = true
    Promise.all([source.listStocks(), source.listHoldings()]).then(([list, held]) => {
      if (!live) return
      quotes.value = Object.fromEntries(list.map(s => [s.id, { price: s.price, history: [s.price] }]))
      favorites.value = Object.fromEntries(list.map(s => [s.id, s.favorite]))
      holdings.value = held
      stocks.value = list
    })
    const unsubscribe = source.subscribeQuotes(({ id, price }) => {
      if (!live) return
      const q = quotes.value[id]
      if (!q) return // not loaded yet
      quotes.value = { ...quotes.value, [id]: { price, history: [...q.history, price].slice(-HISTORY) } }
    })
    return () => {
      live = false
      unsubscribe()
    }
  })

  // One request per change of the trimmed text. Changing it again aborts the request in flight.
  watch(() => trimmed.value, text => {
    if (!text) {
      matches.value = null
      searching.value = false
      return
    }
    const ctrl = new AbortController()
    searching.value = true
    api.search(text, ctrl.signal).then(ids => {
      if (ctrl.signal.aborted) return
      matches.value = ids
      searchFailed.value = false
      searching.value = false
    }, () => {
      if (ctrl.signal.aborted) return
      searchFailed.value = true
      searching.value = false
    })
    return () => ctrl.abort()
  })

  // Show the new star at once, then save. A refused save puts the star back, unless this star was clicked again.
  const toggleFavorite = (stock: Stock) => {
    const id = stock.id
    const before = favorites.get(id)
    const next = !before
    const click = (clicks.get(id) ?? 0) + 1
    clicks.set(id, click)
    favorites.value = { ...favorites.value, [id]: next }
    api.setFavorite(id, next).catch(() => {
      if (clicks.get(id) === click) favorites.value = { ...favorites.value, [id]: before }
      favoriteError.value = `Couldn't update ${stock.symbol}`
    })
  }

  return (
    <>
      {!stocks.value ? (
        <p>Loading…</p>
      ) : (
        <div>
          <Header count={shown.value.length} portfolio={portfolio.value} />
          <label>
            <input type="text" aria-label="Search" value={query.value} onInput={e => (query.value = e.currentTarget.value)} />
          </label>
          <label>
            <input type="checkbox" checked={favoritesOnly.value} onChange={e => (favoritesOnly.value = e.currentTarget.checked)} />
            Favorites only
          </label>
          {searching.value && <p role="status">Searching…</p>}
          {searchFailed.value && <p role="alert">Search failed</p>}
          {favoriteError.value && <p role="alert">{favoriteError.value}</p>}
          <StockList stocks={shown.value} quotes={quotes} favorites={favorites} onToggle={toggleFavorite} />
        </div>
      )}
    </>
  )
}
