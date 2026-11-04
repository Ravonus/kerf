import { createResource, Show } from 'solid-js'
import type { Api } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'

export function App(props: { api: Api }) {
  const [data] = createResource(() =>
    Promise.all([props.api.listStocks(), props.api.listHoldings()]).then(([list, holdings]) => ({
      stocks: list,
      portfolio: holdings.reduce(
        (sum, h) => sum + h.qty * (list.find((s) => s.id === h.id)?.price ?? 0),
        0,
      ),
    })),
  )

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {(loaded) => (
        <div>
          <Header count={loaded().stocks.length} portfolio={loaded().portfolio} />
          <StockList stocks={loaded().stocks} />
        </div>
      )}
    </Show>
  )
}
