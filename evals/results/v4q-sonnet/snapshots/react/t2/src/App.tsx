import { useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { Api, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { createQuoteStore, type QuoteStore } from './store'

function LiveHeader({ count, store }: { count: number; store: QuoteStore }) {
  const portfolio = useSyncExternalStore(store.subscribePortfolio, store.getPortfolio)
  return <Header count={count} portfolio={portfolio} />
}

export function App({ api }: { api: Api }) {
  const [stocks, setStocks] = useState<Stock[] | null>(null)
  const store = useMemo(() => createQuoteStore(), [api])
  const [query, setQuery] = useState('')
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

  const shown = useMemo(() => (stocks && matches ? stocks.filter(s => matches.has(s.id)) : stocks), [stocks, matches])

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
      {searching && <p role="status">Searching…</p>}
      {failed && <p role="alert">Search failed</p>}
      <StockList stocks={shown!} store={store} />
    </div>
  )
}
