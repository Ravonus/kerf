import { state, derived, watch } from 'weft'
import type { Api, Holding, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'

const HISTORY = 20

function load(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const prices = state<Record<string, number>>({})
  const histories = state<Record<string, number[]>>({})

  const query = state(load('weft.search') ?? '')
  const favOnly = state(load('weft.favoritesOnly') === '1')
  const favs = state<Record<string, boolean>>({})
  const errors = state<{ id: string; text: string }[]>([])
  const clicks: Record<string, number> = {}
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
  const shown = derived(() => (favOnly.value ? visible.value.filter(s => favs.value[s.id]) : visible.value))

  watch(() => query.value, v => { save('weft.search', v) })
  watch(() => favOnly.value, v => { save('weft.favoritesOnly', v ? '1' : '0') })

  const toggle = (stock: Stock) => {
    const id = stock.id
    const prev = !!favs.value[id]
    const next = !prev
    const mine = (clicks[id] = (clicks[id] ?? 0) + 1)
    favs.value = { ...favs.value, [id]: next }
    errors.value = errors.value.filter(e => e.id !== id)
    api.setFavorite(id, next).catch(() => {
      if (clicks[id] === mine) favs.value = { ...favs.value, [id]: prev }
      errors.value = [...errors.value.filter(e => e.id !== id), { id, text: `Couldn't update ${stock.symbol}` }]
    })
  }

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
      const f: Record<string, boolean> = {}
      for (const s of list) f[s.id] = s.favorite
      favs.value = f
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
          <Header count={shown.value.length} portfolio={portfolio.value} />
          <input aria-label="Search" value={query.value} onInput={e => { query.value = e.currentTarget.value }} />
          <label>
            <input type="checkbox" checked={favOnly.value} onChange={e => { favOnly.value = e.currentTarget.checked }} /> Favorites only
          </label>
          {errors.value.map(e => <p key={e.id} role="alert">{e.text}</p>)}
          {pending.value && <p role="status">Searching…</p>}
          {failed.value && <p role="alert">Search failed</p>}
          <StockList stocks={shown.value} prices={prices} histories={histories} favs={favs} onToggle={toggle} />
        </div>
      )}
    </>
  )
}
