import { batch, createMemo, createResource, onCleanup, Show } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import type { Api, Holding, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { HISTORY_LEN, type LiveState } from './quotes'

type Loaded = { stocks: Stock[]; holdings: Holding[] }

export function App(props: { api: Api }) {
  const [live, setLive] = createStore<LiveState>({})

  const [data] = createResource(() =>
    Promise.all([props.api.listStocks(), props.api.listHoldings()]).then(([stocks, holdings]): Loaded => {
      const init: LiveState = {}
      for (const s of stocks) init[s.id] = { price: s.price, history: [s.price] }
      setLive(init)
      return { stocks, holdings }
    }),
  )

  // One subscription for the whole app, closed on unmount.
  const unsubscribe = props.api.subscribeQuotes(q => {
    if (!live[q.id]) return
    batch(() =>
      setLive(
        q.id,
        produce(s => {
          s.price = q.price
          s.history.push(q.price)
          if (s.history.length > HISTORY_LEN) s.history.splice(0, s.history.length - HISTORY_LEN)
        }),
      ),
    )
  })
  onCleanup(unsubscribe)

  // Depends only on the prices of held stocks, so it updates only when one of them moves.
  const portfolio = createMemo(() => {
    const d = data()
    if (!d) return 0
    return d.holdings.reduce((sum, h) => sum + h.qty * (live[h.id]?.price ?? 0), 0)
  })

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {loaded => (
        <div>
          <Header count={loaded().stocks.length} portfolio={portfolio()} />
          <StockList stocks={loaded().stocks} live={live} />
        </div>
      )}
    </Show>
  )
}
