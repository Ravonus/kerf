import { useEffect, useState, useSyncExternalStore } from 'react'
import type { Api, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { QuoteContext, QuoteStore } from './quotes'

export function App({ api }: { api: Api }) {
  const [store] = useState(() => new QuoteStore())
  const [stocks, setStocks] = useState<Stock[] | null>(null)
  const portfolio = useSyncExternalStore(store.subscribePortfolio, store.getPortfolio)

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

  if (!stocks) return <p>Loading…</p>
  return (
    <QuoteContext.Provider value={store}>
      <div>
        <Header count={stocks.length} portfolio={portfolio} />
        <StockList stocks={stocks} />
      </div>
    </QuoteContext.Provider>
  )
}
