import { createResource, onCleanup, Show } from 'solid-js'
import type { Api } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { createLive } from './quotes'

type Live = ReturnType<typeof createLive>

export function App(props: { api: Api }) {
  let live: Live | undefined
  const pending: { id: string; price: number }[] = []

  // One subscription for the app; quotes that arrive before the list has loaded are buffered.
  const unsubscribe = props.api.subscribeQuotes(q => {
    if (live) live.byId.get(q.id)?.push(q.price)
    else pending.push(q)
  })
  onCleanup(unsubscribe)

  const [data] = createResource(() =>
    Promise.all([props.api.listStocks(), props.api.listHoldings()]).then(([stocks, holdings]) => {
      live = createLive(stocks, holdings)
      for (const q of pending.splice(0)) live.byId.get(q.id)?.push(q.price)
      return { stocks, live }
    }),
  )

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {loaded => (
        <div>
          <Header count={loaded().stocks.length} portfolio={loaded().live.portfolio()} />
          <StockList stocks={loaded().stocks} live={loaded().live.byId} />
        </div>
      )}
    </Show>
  )
}
