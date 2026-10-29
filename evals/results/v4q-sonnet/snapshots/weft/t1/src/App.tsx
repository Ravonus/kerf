import { state, derived, watch, batch } from 'weft'
import type { Api, Holding, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { HISTORY, type LiveMap } from './live'

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const live = state<LiveMap>({})

  const portfolio = derived(() =>
    holdings.value.reduce((sum, h) => sum + h.qty * (live.get(h.id)?.price ?? 0), 0),
  )

  watch(() => api, source => {
    let alive = true
    let loaded = false
    let pending: { id: string; price: number }[] = []

    const apply = (quotes: { id: string; price: number }[]) => {
      const next: LiveMap = { ...live.value }
      for (const q of quotes) {
        const cur = next[q.id]
        if (!cur) continue
        next[q.id] = { price: q.price, history: [...cur.history, q.price].slice(-HISTORY) }
      }
      live.value = next
    }

    const unsubscribe = source.subscribeQuotes(q => {
      if (!alive) return
      if (!loaded) pending.push(q)
      else apply([q])
    })

    Promise.all([source.listStocks(), source.listHoldings()]).then(([list, h]) => {
      if (!alive) return
      const map: LiveMap = {}
      for (const s of list) map[s.id] = { price: s.price, history: [s.price] }
      batch(() => {
        live.value = map
        holdings.value = h
        stocks.value = list
      })
      loaded = true
      if (pending.length) apply(pending)
      pending = []
    })
    return () => { alive = false; unsubscribe() }
  })

  return (
    <>
      {!stocks.value ? (
        <p>Loading…</p>
      ) : (
        <div>
          <Header count={stocks.value.length} portfolio={portfolio.value} />
          <StockList stocks={stocks.value} live={live} />
        </div>
      )}
    </>
  )
}
