import { derived, state, watch } from 'weft'
import type { Api, Holding, Quotes, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'

/** Prices kept per stock for its sparkline. */
const HISTORY = 20

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const quotes = state<Quotes>({})
  const portfolio = derived(() => holdings.value.reduce((sum, h) => sum + h.qty * (quotes.get(h.id)?.price ?? 0), 0))

  watch(() => api, source => {
    let live = true
    Promise.all([source.listStocks(), source.listHoldings()]).then(([list, held]) => {
      if (!live) return
      quotes.value = Object.fromEntries(list.map(s => [s.id, { price: s.price, history: [s.price] }]))
      holdings.value = held
      stocks.value = list
    })
    const unsubscribe = source.subscribeQuotes(({ id, price }) => {
      if (!live) return
      const q = quotes.value[id]
      if (!q) return // not loaded yet
      quotes.value = { ...quotes.value, [id]: { price, history: [...q.history, price].slice(-HISTORY) } }
    })
    return () => {
      live = false
      unsubscribe()
    }
  })

  return (
    <>
      {!stocks.value ? (
        <p>Loading…</p>
      ) : (
        <div>
          <Header count={stocks.value.length} portfolio={portfolio.value} />
          <StockList stocks={stocks.value} quotes={quotes} />
        </div>
      )}
    </>
  )
}
