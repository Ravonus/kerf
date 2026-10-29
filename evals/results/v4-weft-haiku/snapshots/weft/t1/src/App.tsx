import { derived, state, watch } from 'weft'
import type { Api, Holding, Quote, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'

/** The latest price per stock id, with the last 20 prices (oldest first) for its sparkline. */
export type Latest = { price: number; history: number[] }

const HISTORY = 20

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const quotes = state<Record<string, Latest>>({})
  const byId = derived(() => new Map((stocks.value ?? []).map(s => [s.id, s])))
  const portfolio = derived(() =>
    holdings.value.reduce((sum, h) => sum + h.qty * (quotes.value[h.id]?.price ?? byId.value.get(h.id)?.price ?? 0), 0),
  )

  watch(() => api, source => {
    let live = true
    Promise.all([source.listStocks(), source.listHoldings()]).then(([list, hs]) => {
      if (!live) return
      stocks.value = list
      holdings.value = hs
    })
    return () => { live = false }
  })

  // One subscription for the app's lifetime. Quotes are applied once the list has loaded (they need its base price).
  watch(() => api, source => source.subscribeQuotes((q: Quote) => {
    const base = byId.value.get(q.id)
    if (!base) return
    const prev = quotes.value[q.id] ?? { price: base.price, history: [base.price] }
    quotes.value = { ...quotes.value, [q.id]: { price: q.price, history: [...prev.history, q.price].slice(-HISTORY) } }
  }))

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
