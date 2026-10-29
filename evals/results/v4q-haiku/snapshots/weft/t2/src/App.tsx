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

  // Search. `matches` is the latest answer (null: no search, show every stock).
  const query = state('')
  const trimmed = derived(() => query.value.trim())
  const matches = state<string[] | null>(null)
  const searching = state(false)
  const searchFailed = state(false)
  const shown = derived((): Stock[] => {
    const all = stocks.value
    if (!all) return []
    const ids = matches.value
    if (ids === null) return all
    const keep = new Set(ids)
    return all.filter(s => keep.has(s.id))
  })

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

  // One request per change of the trimmed text. Changing it again aborts the request in flight.
  watch(() => trimmed.value, text => {
    if (!text) {
      matches.value = null
      searching.value = false
      return
    }
    const ctrl = new AbortController()
    searching.value = true
    api.search(text, ctrl.signal).then(ids => {
      if (ctrl.signal.aborted) return
      matches.value = ids
      searchFailed.value = false
      searching.value = false
    }, () => {
      if (ctrl.signal.aborted) return
      searchFailed.value = true
      searching.value = false
    })
    return () => ctrl.abort()
  })

  return (
    <>
      {!stocks.value ? (
        <p>Loading…</p>
      ) : (
        <div>
          <Header count={shown.value.length} portfolio={portfolio.value} />
          <label>
            <input type="text" aria-label="Search" value={query.value} onInput={e => (query.value = e.currentTarget.value)} />
          </label>
          {searching.value && <p role="status">Searching…</p>}
          {searchFailed.value && <p role="alert">Search failed</p>}
          <StockList stocks={shown.value} quotes={quotes} />
        </div>
      )}
    </>
  )
}
