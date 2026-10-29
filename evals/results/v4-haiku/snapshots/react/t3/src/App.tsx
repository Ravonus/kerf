import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Api, Quote } from './api'
import { Header } from './components/Header'
import { Search } from './components/Search'
import { StockList } from './components/StockList'
import { QuoteStore, useFavoriteSet } from './quotes'
import { loadFlag, saveFlag } from './storage'

export const FAVORITES_ONLY_KEY = 'watchlist.favoritesOnly'

export function App({ api }: { api: Api }) {
  const [store, setStore] = useState<QuoteStore | null>(null)
  // Ids returned by the latest search, or null to show every stock.
  const [matches, setMatches] = useState<Set<string> | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(() => loadFlag(FAVORITES_ONLY_KEY))
  const [saveError, setSaveError] = useState<string | null>(null)
  const onResults = useCallback((ids: string[] | null) => setMatches(ids === null ? null : new Set(ids)), [])
  const onSaveError = useCallback((message: string | null) => setSaveError(message), [])
  const favorites = useFavoriteSet(store)
  const favoriteFilter = favoritesOnly ? favorites : null

  useEffect(() => saveFlag(FAVORITES_ONLY_KEY, favoritesOnly), [favoritesOnly])

  useEffect(() => {
    let live = true
    let current: QuoteStore | null = null
    const early: Quote[] = []
    // One subscription for the whole app; quotes that arrive before the list loads are applied once it has.
    const unsubscribe = api.subscribeQuotes(q => (current ? current.apply(q) : early.push(q)))
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      current = new QuoteStore(list, holdings)
      early.forEach(current.apply)
      setStore(current)
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [api])

  const visible = useMemo(() => {
    if (!store) return []
    if (!matches && !favoriteFilter) return store.stocks
    return store.stocks.filter(s => (!matches || matches.has(s.id)) && (!favoriteFilter || favoriteFilter.has(s.id)))
  }, [store, matches, favoriteFilter])

  if (!store) return <p>Loading…</p>
  return (
    <div>
      <Header count={visible.length} store={store} />
      {saveError && <p role="alert">{saveError}</p>}
      <Search api={api} onResults={onResults} />
      <label>
        <input type="checkbox" checked={favoritesOnly} onChange={e => setFavoritesOnly(e.target.checked)} /> Favorites only
      </label>
      <StockList stocks={visible} store={store} api={api} onSaveError={onSaveError} />
    </div>
  )
}
