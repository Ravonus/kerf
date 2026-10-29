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
      <LiveHeader count={stocks.length} store={store} />
      <StockList stocks={stocks} store={store} />
    </div>
  )
}
