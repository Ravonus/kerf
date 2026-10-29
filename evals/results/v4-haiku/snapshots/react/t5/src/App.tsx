import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Api, Quote } from './api'
import { DetailsPanel } from './components/DetailsPanel'
import { Header } from './components/Header'
import { Search } from './components/Search'
import { StockList } from './components/StockList'
import { NotesStore } from './notes'
import { QuoteStore, useFavoriteSet, useQuoteVersion } from './quotes'
import { loadFlag, loadString, saveFlag, saveString } from './storage'

export const FAVORITES_ONLY_KEY = 'watchlist.favoritesOnly'
export const SORT_KEY = 'watchlist.sort'
export type SortKey = 'symbol' | 'change'

const loadSort = (): SortKey => (loadString(SORT_KEY, 'symbol') === 'change' ? 'change' : 'symbol')

export function App({ api }: { api: Api }) {
  const [store, setStore] = useState<QuoteStore | null>(null)
  const [notes] = useState(() => new NotesStore())
  // Ids returned by the latest search, or null to show every stock.
  const [matches, setMatches] = useState<Set<string> | null>(null)
  const [favoritesOnly, setFavoritesOnly] = useState(() => loadFlag(FAVORITES_ONLY_KEY))
  const [sort, setSort] = useState<SortKey>(loadSort)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)
  const onResults = useCallback((ids: string[] | null) => setMatches(ids === null ? null : new Set(ids)), [])
  const onSaveError = useCallback((message: string | null) => setSaveError(message), [])
  const openDetails = useCallback((id: string, el: HTMLElement) => {
    opener.current = el
    setOpenId(id)
  }, [])
  const closeDetails = useCallback(() => {
    setOpenId(null)
    opener.current?.focus()
  }, [])
  const favorites = useFavoriteSet(store)
  const favoriteFilter = favoritesOnly ? favorites : null
  const byChange = sort === 'change'
  // Only the change sort needs to hear about every quote; the symbol order never changes.
  const version = useQuoteVersion(store, byChange)

  useEffect(() => saveFlag(FAVORITES_ONLY_KEY, favoritesOnly), [favoritesOnly])
  useEffect(() => saveString(SORT_KEY, sort), [sort])

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
    let list = store.stocks
    if (matches || favoriteFilter) {
      list = list.filter(s => (!matches || matches.has(s.id)) && (!favoriteFilter || favoriteFilter.has(s.id)))
    }
    // Copy before sorting; the sort is stable, so ties keep list order.
    if (byChange) list = [...list].sort((a, b) => store.changeOf(b.id) - store.changeOf(a.id))
    return list
  }, [store, matches, favoriteFilter, byChange, byChange ? version : 0])

  if (!store) return <p>Loading…</p>
  return (
    <div>
      <Header count={visible.length} store={store} />
      {saveError && <p role="alert">{saveError}</p>}
      <Search api={api} onResults={onResults} />
      <label>
        <input type="checkbox" checked={favoritesOnly} onChange={e => setFavoritesOnly(e.target.checked)} /> Favorites only
      </label>
      <label>
        Sort{' '}
        <select value={sort} onChange={e => setSort(e.target.value as SortKey)}>
          <option value="symbol">Symbol</option>
          <option value="change">Change</option>
        </select>
      </label>
      {openId !== null && (
        <DetailsPanel key={openId} id={openId} store={store} api={api} notes={notes} onClose={closeDetails} />
      )}
      <StockList stocks={visible} store={store} api={api} onSaveError={onSaveError} onOpen={openDetails} />
    </div>
  )
}
