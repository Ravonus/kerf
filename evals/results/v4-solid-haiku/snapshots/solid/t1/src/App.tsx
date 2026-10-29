import { createMemo, createResource, onCleanup, Show } from 'solid-js'
import type { Api, Holding, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { createLiveQuotes, type LiveQuote } from './lib/live'

type Loaded = { stocks: Stock[]; holdings: Holding[]; quotes: Map<string, LiveQuote> }

export function App(props: { api: Api }) {
  const [data] = createResource(() =>
    Promise.all([props.api.listStocks(), props.api.listHoldings()]).then(
      ([list, holdings]): Loaded => ({ stocks: list, holdings, quotes: createLiveQuotes(list) }),
    ),
  )

  // Quotes that arrive before the list has loaded have no row yet and are dropped.
  const unsubscribe = props.api.subscribeQuotes(q => data()?.quotes.get(q.id)?.apply(q.price))
  onCleanup(unsubscribe)

  // Reads only the held stocks' prices, so it changes only when one of them moves.
  const portfolio = createMemo(() => {
    const d = data()
    if (!d) return 0
    return d.holdings.reduce((sum, h) => sum + h.qty * (d.quotes.get(h.id)?.price() ?? 0), 0)
  })

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {loaded => (
        <div>
          <Header count={loaded().stocks.length} portfolio={portfolio()} />
          <StockList stocks={loaded().stocks} quotes={loaded().quotes} />
        </div>
      )}
    </Show>
  )
}
