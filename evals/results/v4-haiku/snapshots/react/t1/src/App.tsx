import { useEffect, useState } from 'react'
import type { Api, Quote } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { QuoteStore } from './quotes'

export function App({ api }: { api: Api }) {
  const [store, setStore] = useState<QuoteStore | null>(null)

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

  if (!store) return <p>Loading…</p>
  return (
    <div>
      <Header count={store.stocks.length} store={store} />
      <StockList stocks={store.stocks} store={store} />
    </div>
  )
}
