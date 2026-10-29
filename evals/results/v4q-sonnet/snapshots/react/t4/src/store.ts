import type { Holding, Stock } from './api'

export const HISTORY = 20

type Listener = () => void

/** External quote store: per-stock price history, so a quote re-renders only that row (and the header if held). */
export function createQuoteStore() {
  const history = new Map<string, number[]>()
  const rowListeners = new Map<string, Set<Listener>>()
  const portfolioListeners = new Set<Listener>()
  const qty = new Map<string, number>()
  let portfolio = 0
  let ready = false
  let pending: { id: string; price: number }[] = []

  const sum = () => {
    let t = 0
    for (const [id, q] of qty) t += q * (history.get(id)?.at(-1) ?? 0)
    return t
  }

  const apply = (id: string, price: number): boolean => {
    const h = history.get(id)
    if (!h) return false
    history.set(id, [...h, price].slice(-HISTORY))
    rowListeners.get(id)?.forEach(l => l())
    return qty.has(id)
  }

  return {
    init(stocks: Stock[], holdings: Holding[]) {
      history.clear()
      qty.clear()
      for (const s of stocks) history.set(s.id, [s.price])
      for (const h of holdings) qty.set(h.id, (qty.get(h.id) ?? 0) + h.qty)
      ready = true
      const queued = pending
      pending = []
      for (const q of queued) apply(q.id, q.price)
      portfolio = sum()
      portfolioListeners.forEach(l => l())
    },
    quote(q: { id: string; price: number }) {
      if (!ready) { pending.push(q); return }
      if (apply(q.id, q.price)) {
        portfolio = sum()
        portfolioListeners.forEach(l => l())
      }
    },
    getHistory: (id: string) => history.get(id) ?? [],
    getPortfolio: () => portfolio,
    subscribeRow(id: string, l: Listener) {
      let set = rowListeners.get(id)
      if (!set) rowListeners.set(id, (set = new Set()))
      set.add(l)
      return () => { set!.delete(l) }
    },
    subscribePortfolio(l: Listener) {
      portfolioListeners.add(l)
      return () => { portfolioListeners.delete(l) }
    },
  }
}

export type QuoteStore = ReturnType<typeof createQuoteStore>
