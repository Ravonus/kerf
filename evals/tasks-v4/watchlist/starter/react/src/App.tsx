import { useEffect, useState } from 'react'
import type { Api, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'

export function App({ api }: { api: Api }) {
  const [stocks, setStocks] = useState<Stock[] | null>(null)
  const [portfolio, setPortfolio] = useState(0)

  useEffect(() => {
    let live = true
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      setStocks(list)
      setPortfolio(holdings.reduce((sum, h) => sum + h.qty * (list.find(s => s.id === h.id)?.price ?? 0), 0))
    })
    return () => { live = false }
  }, [api])

  if (!stocks) return <p>Loading…</p>
  return (
    <div>
      <Header count={stocks.length} portfolio={portfolio} />
      <StockList stocks={stocks} />
    </div>
  )
}
