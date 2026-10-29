import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Api, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { QuoteContext, QuoteStore } from './quotes'

export function App({ api }: { api: Api }) {
  const [store] = useState(() => new QuoteStore())
  const [stocks, setStocks] = useState<Stock[] | null>(null)
  const portfolio = useSyncExternalStore(store.subscribePortfolio, store.getPortfolio)
  const [query, setQuery] = useState('')
  // null means "show every stock"; otherwise the results of the latest successful search.
  const [shown, setShown] = useState<Stock[] | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const trimmed = query.trim()

  // One quote subscription for the whole app, closed on unmount.
  useEffect(() => api.subscribeQuotes(q => store.push(q.id, q.price)), [api, store])

  useEffect(() => {
    let live = true
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      store.init(list, holdings)
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

  if (!stocks) return <p>Loading…</p>
  const visible = shown ?? stocks
  return (
    <QuoteContext.Provider value={store}>
      <div>
        <Header count={visible.length} portfolio={portfolio} />
        <label htmlFor="search">Search</label>
        <input id="search" type="text" value={query} onChange={e => setQuery(e.target.value)} />
        {pending && <p role="status">Searching…</p>}
        {failed && <p role="alert">Search failed</p>}
        <StockList stocks={visible} />
      </div>
    </QuoteContext.Provider>
  )
}
