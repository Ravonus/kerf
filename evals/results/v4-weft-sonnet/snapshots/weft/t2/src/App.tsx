import { state, derived, watch } from 'weft'
import type { Api, Holding, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'

const HISTORY = 20

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const prices = state<Record<string, number>>({})
  const histories = state<Record<string, number[]>>({})

  const query = state('')
  const matched = state<string[] | null>(null)
  const pending = state(false)
  const failed = state(false)
  const visible = derived(() => {
    const list = stocks.value ?? []
    const ids = matched.value
    if (!ids) return list
    const set = new Set(ids)
    return list.filter(s => set.has(s.id))
  })

  const portfolio = derived(() => holdings.value.reduce((sum, h) => sum + h.qty * (prices.get(h.id) ?? 0), 0))

  watch(() => api, source => {
    let live = true
    let loaded = false
    const queue: { id: string; price: number }[] = []
    const apply = (quotes: { id: string; price: number }[]) => {
      const p = { ...prices.value }
      const h = { ...histories.value }
      for (const q of quotes) {
        if (!(q.id in p)) continue
        p[q.id] = q.price
        h[q.id] = [...h[q.id], q.price].slice(-HISTORY)
      }
      prices.value = p
      histories.value = h
    }
    const unsubscribe = source.subscribeQuotes(q => {
      if (!live) return
      if (loaded) apply([q])
      else queue.push(q)
    })
    Promise.all([source.listStocks(), source.listHoldings()]).then(([list, hs]) => {
      if (!live) return
      const p: Record<string, number> = {}
      const h: Record<string, number[]> = {}
      for (const s of list) { p[s.id] = s.price; h[s.id] = [s.price] }
      prices.value = p
      histories.value = h
      holdings.value = hs
      stocks.value = list
      loaded = true
      if (queue.length) apply(queue.splice(0))
    })
    return () => { live = false; unsubscribe() }
  })

  watch(() => query.value.trim(), text => {
    if (!text) {
      matched.value = null
      pending.value = false
      failed.value = false
      return
    }
    const ctrl = new AbortController()
    pending.value = true
    api.search(text, ctrl.signal).then(
      ids => {
        if (ctrl.signal.aborted) return
        matched.value = ids
        pending.value = false
        failed.value = false
      },
      () => {
        if (ctrl.signal.aborted) return
        pending.value = false
        failed.value = true
      },
    )
    return () => ctrl.abort()
  })

  return (
    <>
      {!stocks.value ? (
        <p>Loading…</p>
      ) : (
        <div>
          <Header count={visible.value.length} portfolio={portfolio.value} />
          <input aria-label="Search" value={query.value} onInput={e => { query.value = e.currentTarget.value }} />
          {pending.value && <p role="status">Searching…</p>}
          {failed.value && <p role="alert">Search failed</p>}
          <StockList stocks={visible.value} prices={prices} histories={histories} />
        </div>
      )}
    </>
  )
}
