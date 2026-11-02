import { state, watch } from '@weft-js/core'
import type { Api, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const portfolio = state(0)

  watch(() => api, source => {
    let live = true
    Promise.all([source.listStocks(), source.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      stocks.value = list
      portfolio.value = holdings.reduce((sum, h) => sum + h.qty * (list.find(s => s.id === h.id)?.price ?? 0), 0)
    })
    return () => { live = false }
  })

  return (
    <>
      {!stocks.value ? (
        <p>Loading…</p>
      ) : (
        <div>
          <Header count={stocks.value.length} portfolio={portfolio.value} />
          <StockList stocks={stocks.value} />
        </div>
      )}
    </>
  )
}
