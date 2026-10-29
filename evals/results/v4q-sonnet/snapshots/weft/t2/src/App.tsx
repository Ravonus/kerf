import { state, derived, watch, batch } from 'weft'
import type { Api, Holding, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { HISTORY, type LiveMap } from './live'

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const live = state<LiveMap>({})
  const query = state('')
  const matched = state<string[] | null>(null)
  const pending = state(false)
  const failed = state(false)
  const shown = derived(() => {
    const all = stocks.value
    const ids = matched.value
    if (!all || !ids) return all
    const set = new Set(ids)
    return all.filter(s => set.has(s.id))
  })

  watch(() => query.value.trim(), (text, ) => {
    if (!text) {
      matched.value = null
      pending.value = false
      failed.value = false
      return
    }
    const ctrl = new AbortController()
    pending.value = true
    api.search(text, ctrl.signal).then(ids => {
      if (ctrl.signal.aborted) return
      batch(() => {
        matched.value = ids
        pending.value = false
        failed.value = false
      })
    }, () => {
      if (ctrl.signal.aborted) return
      batch(() => {
        pending.value = false
        failed.value = true
      })
    })
    return () => ctrl.abort()
  })

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
          <Header count={shown.value?.length ?? 0} portfolio={portfolio.value} />
          <label>
            Search
            <input value={query.value} onInput={e => { query.value = e.currentTarget.value }} />
          </label>
          {pending.value && <p role="status">Searching…</p>}
          {failed.value && <p role="alert">Search failed</p>}
          <StockList stocks={shown.value ?? []} live={live} />
        </div>
      )}
    </>
  )
}
