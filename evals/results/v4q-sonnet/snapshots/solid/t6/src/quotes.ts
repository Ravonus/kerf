import { createMemo, createSignal, type Accessor } from 'solid-js'
import type { Holding, Stock } from './api'

const MAX_HISTORY = 20

export type Live = { price: Accessor<number>; history: Accessor<number[]>; push: (price: number) => void
  favorite: Accessor<boolean>
  setFavorite: (v: boolean) => void
  clicks: number
}

/** Per-stock fine-grained live state: a quote only touches the signals of its own stock. */
export function createLive(stocks: Stock[], holdings: Holding[]) {
  const byId = new Map<string, Live>()
  for (const s of stocks) {
    const [price, setPrice] = createSignal(s.price)
    const [history, setHistory] = createSignal([s.price])
    const [favorite, setFavorite] = createSignal(s.favorite)
    byId.set(s.id, {
      favorite,
      setFavorite,
      clicks: 0,
      price,
      history,
      push(p) {
        setPrice(p)
        setHistory(h => [...h.slice(-(MAX_HISTORY - 1)), p])
      },
    })
  }
  const portfolio = createMemo(() => holdings.reduce((sum, h) => sum + h.qty * (byId.get(h.id)?.price() ?? 0), 0))
  return { byId, portfolio }
}
