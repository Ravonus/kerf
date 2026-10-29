import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Api, Quote } from './api'
import { Header } from './components/Header'
import { Search } from './components/Search'
import { StockList } from './components/StockList'
import { QuoteStore } from './quotes'

export function App({ api }: { api: Api }) {
  const [store, setStore] = useState<QuoteStore | null>(null)
  // Ids returned by the latest search, or null to show every stock.
  const [matches, setMatches] = useState<Set<string> | null>(null)
  const onResults = useCallback((ids: string[] | null) => setMatches(ids === null ? null : new Set(ids)), [])

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

  const visible = useMemo(
    () => (store && matches ? store.stocks.filter(s => matches.has(s.id)) : store?.stocks ?? []),
    [store, matches],
  )

  if (!store) return <p>Loading…</p>
  return (
    <div>
      <Header count={visible.length} store={store} />
      <Search api={api} onResults={onResults} />
      <StockList stocks={visible} store={store} />
    </div>
  )
}
