import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import type { Api, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { QuoteContext, QuoteStore } from './quotes'

const QUERY_KEY = 'watchlist.query'
const FAVORITES_ONLY_KEY = 'watchlist.favoritesOnly'

// Storage can be unavailable (private mode, blocked cookies); the app still works without persistence.
function readStored(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* not persisted */ }
}

export function App({ api }: { api: Api }) {
  const [store] = useState(() => new QuoteStore())
  const [stocks, setStocks] = useState<Stock[] | null>(null)
  const portfolio = useSyncExternalStore(store.subscribePortfolio, store.getPortfolio)

  const [query, setQuery] = useState(() => readStored(QUERY_KEY) ?? '')
  const [favoritesOnly, setFavoritesOnly] = useState(() => readStored(FAVORITES_ONLY_KEY) === 'true')
  // null means "show every stock"; otherwise the results of the latest successful search.
  const [shown, setShown] = useState<Stock[] | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const trimmed = query.trim()

  // Favorite flags shown on screen (optimistic). A ref mirrors them so click handlers read the latest value.
  const [favorites, setFavorites] = useState<Record<string, boolean>>({})
  const favoritesRef = useRef(favorites)
  // symbol by id, for stocks whose last save failed.
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const clickCount = useRef(0)
  const latestClick = useRef(new Map<string, number>())

  useEffect(() => writeStored(QUERY_KEY, query), [query])
  useEffect(() => writeStored(FAVORITES_ONLY_KEY, String(favoritesOnly)), [favoritesOnly])

  // One quote subscription for the whole app, closed on unmount.
  useEffect(() => api.subscribeQuotes(q => store.push(q.id, q.price)), [api, store])

  useEffect(() => {
    let live = true
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      store.init(list, holdings)
      const initial = Object.fromEntries(list.map(s => [s.id, s.favorite]))
      favoritesRef.current = initial
      setFavorites(initial)
      setStocks(list)
    })
    return () => { live = false }
  }, [api, store])

  // Each query aborts the one before it. Only the latest, unaborted request may update the state.
  useEffect(() => {
    if (!stocks || !trimmed) {
      setShown(null)
      setPending(false)
      setFailed(false)
      return
    }
    const controller = new AbortController()
    const byId = new Map(stocks.map(s => [s.id, s]))
    setPending(true)
    api.search(trimmed, controller.signal).then(
      ids => {
        if (controller.signal.aborted) return
        setShown(ids.flatMap(id => byId.get(id) ?? []))
        setFailed(false)
        setPending(false)
      },
      () => {
        if (controller.signal.aborted) return
        setFailed(true)
        setPending(false)
      },
    )
    return () => controller.abort()
  }, [api, stocks, trimmed])

  const toggleFavorite = useCallback((stock: Stock) => {
    const id = stock.id
    const before = favoritesRef.current[id]
    const token = ++clickCount.current
    latestClick.current.set(id, token)
    favoritesRef.current = { ...favoritesRef.current, [id]: !before }
    setFavorites(favoritesRef.current)
    setSaveErrors(e => Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)))
    api.setFavorite(id, !before).catch(() => {
      setSaveErrors(e => ({ ...e, [id]: stock.symbol }))
      // Put the star back only if this is still the latest click on it.
      if (latestClick.current.get(id) === token) {
        favoritesRef.current = { ...favoritesRef.current, [id]: before }
        setFavorites(favoritesRef.current)
      }
    })
  }, [api])

  if (!stocks) return <p>Loading…</p>
  const searched = shown ?? stocks
  const visible = favoritesOnly ? searched.filter(s => favorites[s.id]) : searched
  return (
    <QuoteContext.Provider value={store}>
      <div>
        <Header count={visible.length} portfolio={portfolio} />
        <label htmlFor="search">Search</label>
        <input id="search" type="text" value={query} onChange={e => setQuery(e.target.value)} />
        <label>
          <input type="checkbox" checked={favoritesOnly} onChange={e => setFavoritesOnly(e.target.checked)} />
          Favorites only
        </label>
        {pending && <p role="status">Searching…</p>}
        {failed && <p role="alert">Search failed</p>}
        {Object.entries(saveErrors).map(([id, symbol]) => (
          <p key={id} role="alert">{`Couldn't update ${symbol}`}</p>
        ))}
        <StockList stocks={visible} favorites={favorites} onToggleFavorite={toggleFavorite} />
      </div>
    </QuoteContext.Provider>
  )
}
