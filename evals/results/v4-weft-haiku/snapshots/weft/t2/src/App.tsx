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
  const query = state('')
  /** Ids from the latest successful search; null shows every stock. */
  const found = state<string[] | null>(null)
  const searching = state(false)
  const failed = state(false)

  const byId = derived(() => new Map((stocks.value ?? []).map(s => [s.id, s])))
  const portfolio = derived(() =>
    holdings.value.reduce((sum, h) => sum + h.qty * (quotes.value[h.id]?.price ?? byId.value.get(h.id)?.price ?? 0), 0),
  )
  const shown = derived(() => {
    const all = stocks.value ?? []
    if (found.value === null) return all
    const ids = new Set(found.value)
    return all.filter(s => ids.has(s.id))
  })

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

  // Each change of the trimmed text aborts the request in flight (the cleanup) and sends a new one. Only the
  // request that is still current may write results.
  // A derived text: an edit that leaves the trimmed text unchanged wakes nothing (watch alone re-runs on any read change).
  const text = derived(() => query.value.trim())
  watch(() => text.value, text => {
    if (text === '') {
      found.value = null
      searching.value = false
      return
    }
    const ctrl = new AbortController()
    searching.value = true
    api.search(text, ctrl.signal).then(ids => {
      if (ctrl.signal.aborted) return
      found.value = ids
      failed.value = false
      searching.value = false
    }, () => {
      if (ctrl.signal.aborted) return
      failed.value = true
      searching.value = false
    })
    return () => ctrl.abort()
  })

  return (
    <div>
      <label>
        Search <input value={query.value} onInput={e => (query.value = e.currentTarget.value)} />
      </label>
      {searching.value && <p role="status">Searching…</p>}
      {failed.value && <p role="alert">Search failed</p>}
      {!stocks.value ? (
        <p>Loading…</p>
      ) : (
        <div>
          <Header count={shown.value.length} portfolio={portfolio.value} />
          <StockList stocks={shown.value} quotes={quotes} />
        </div>
      )}
    </div>
  )
}
