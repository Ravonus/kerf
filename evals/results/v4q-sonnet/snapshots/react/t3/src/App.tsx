import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Api, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { createQuoteStore, type QuoteStore } from './store'

function load(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

function LiveHeader({ count, store }: { count: number; store: QuoteStore }) {
  const portfolio = useSyncExternalStore(store.subscribePortfolio, store.getPortfolio)
  return <Header count={count} portfolio={portfolio} />
}

export function App({ api }: { api: Api }) {
  const [stocks, setStocks] = useState<Stock[] | null>(null)
  const store = useMemo(() => createQuoteStore(), [api])
  const [query, setQuery] = useState(() => load('watchlist.search') ?? '')
  const [favoritesOnly, setFavoritesOnly] = useState(() => load('watchlist.favoritesOnly') === 'true')
  const [favs, setFavs] = useState<Record<string, boolean>>({})
  const [favErrors, setFavErrors] = useState<Record<string, string>>({})
  const favRef = useRef<Record<string, boolean>>({})
  const clicks = useRef<Record<string, number>>({})
  const stocksRef = useRef<Stock[] | null>(null)
  stocksRef.current = stocks
  useEffect(() => save('watchlist.search', query), [query])
  useEffect(() => save('watchlist.favoritesOnly', String(favoritesOnly)), [favoritesOnly])

  const toggleFavorite = useCallback((id: string) => {
    const stock = stocksRef.current?.find(s => s.id === id)
    if (!stock) return
    const before = favRef.current[id] ?? stock.favorite
    const next = !before
    const token = (clicks.current[id] = (clicks.current[id] ?? 0) + 1)
    favRef.current = { ...favRef.current, [id]: next }
    setFavs(favRef.current)
    setFavErrors(e => { if (!(id in e)) return e; const { [id]: _, ...rest } = e; return rest })
    api.setFavorite(id, next).catch(() => {
      if (clicks.current[id] === token) {
        favRef.current = { ...favRef.current, [id]: before }
        setFavs(favRef.current)
      }
      setFavErrors(e => ({ ...e, [id]: `Couldn't update ${stock.symbol}` }))
    })
  }, [api])
  const [matches, setMatches] = useState<Set<string> | null>(null)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const term = query.trim()

  useEffect(() => {
    if (!term) {
      setMatches(null)
      setSearching(false)
      setFailed(false)
      return
    }
    const ctrl = new AbortController()
    setSearching(true)
    api.search(term, ctrl.signal).then(
      ids => { if (ctrl.signal.aborted) return; setMatches(new Set(ids)); setFailed(false); setSearching(false) },
      () => { if (ctrl.signal.aborted) return; setFailed(true); setSearching(false) },
    )
    return () => ctrl.abort()
  }, [api, term])

  const shown = useMemo(
    () => stocks && (matches || favoritesOnly)
      ? stocks.filter(s => (!matches || matches.has(s.id)) && (!favoritesOnly || (favs[s.id] ?? s.favorite)))
      : stocks,
    [stocks, matches, favoritesOnly, favs],
  )

  useEffect(() => {
    let live = true
    const unsubscribe = api.subscribeQuotes(q => { if (live) store.quote(q) })
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      store.init(list, holdings)
      setStocks(list)
    })
    return () => { live = false; unsubscribe() }
  }, [api, store])

  if (!stocks) return <p>Loading…</p>
  return (
    <div>
      <LiveHeader count={shown!.length} store={store} />
      <label>
        Search
        <input type="text" value={query} onChange={e => setQuery(e.target.value)} />
      </label>
      <label>
        <input type="checkbox" checked={favoritesOnly} onChange={e => setFavoritesOnly(e.target.checked)} />
        Favorites only
      </label>
      {searching && <p role="status">Searching…</p>}
      {failed && <p role="alert">Search failed</p>}
      {Object.entries(favErrors).map(([id, msg]) => <p key={id} role="alert">{msg}</p>)}
      <StockList stocks={shown!} store={store} favs={favs} onToggle={toggleFavorite} />
    </div>
  )
}
