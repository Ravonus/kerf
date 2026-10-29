import { batch, createMemo, createResource, createSignal, onCleanup, Show, type Accessor } from 'solid-js'
import type { Api, Holding, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'

export type Live = { price: Accessor<number>; history: Accessor<number[]> }
type Entry = Live & { push: (p: number) => void }

function makeEntry(initial: number): Entry {
  const [price, setPrice] = createSignal(initial)
  const [history, setHistory] = createSignal([initial])
  return {
    price,
    history,
    push(p) {
      batch(() => {
        setPrice(p)
        setHistory(h => [...h.slice(-19), p])
      })
    },
  }
}

export function App(props: { api: Api }) {
  const entries = new Map<string, Entry>()
  let pending: { id: string; price: number }[] | null = []
  const apply = (q: { id: string; price: number }) => entries.get(q.id)?.push(q.price)

  const unsubscribe = props.api.subscribeQuotes(q => (pending ? pending.push(q) : apply(q)))
  onCleanup(unsubscribe)

  const [data] = createResource(() =>
    Promise.all([props.api.listStocks(), props.api.listHoldings()]).then(([list, holdings]) => {
      for (const s of list) entries.set(s.id, makeEntry(s.price))
      const queued = pending!
      pending = null
      batch(() => queued.forEach(apply))
      return { stocks: list, holdings }
    }),
  )

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {loaded => {
        const portfolio = createMemo(() =>
          loaded().holdings.reduce((sum: number, h: Holding) => sum + h.qty * (entries.get(h.id)?.price() ?? 0), 0),
        )
        return (
          <div>
            <Header count={loaded().stocks.length} portfolio={portfolio()} />
            <StockList stocks={loaded().stocks} live={id => entries.get(id)!} />
          </div>
        )
      }}
    </Show>
  )
}
