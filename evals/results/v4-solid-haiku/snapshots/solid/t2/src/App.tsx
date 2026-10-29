import { createEffect, createMemo, createResource, createSignal, on, onCleanup, Show } from 'solid-js'
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

  // Search. `results` null means no search is active and every stock is shown.
  const [query, setQuery] = createSignal('')
  const trimmed = createMemo(() => query().trim())
  const [results, setResults] = createSignal<string[] | null>(null)
  const [searchState, setSearchState] = createSignal<'idle' | 'pending' | 'error'>('idle')
  let current: AbortController | undefined

  createEffect(
    on(trimmed, q => {
      current?.abort()
      current = undefined
      if (!q) {
        setResults(null)
        setSearchState('idle')
        return
      }
      const ctrl = new AbortController()
      current = ctrl
      setSearchState('pending')
      props.api.search(q, ctrl.signal).then(
        ids => {
          if (ctrl.signal.aborted) return
          setResults(ids)
          setSearchState('idle')
        },
        () => {
          if (ctrl.signal.aborted) return
          setSearchState('error')
        },
      )
    }),
  )
  onCleanup(() => current?.abort())

  // Rows for the matching stocks, in list order. The stock objects are the same as in the full list, so
  // rows that stay are reused by the list instead of being rendered again.
  const shown = createMemo(() => {
    const list = data()?.stocks ?? []
    const ids = results()
    if (!ids) return list
    const match = new Set(ids)
    return list.filter(s => match.has(s.id))
  })

  return (
    <div>
      <label>
        Search <input type="text" value={query()} onInput={e => setQuery(e.currentTarget.value)} />
      </label>
      <Show when={searchState() === 'pending'}>
        <p role="status">Searching…</p>
      </Show>
      <Show when={searchState() === 'error'}>
        <p role="alert">Search failed</p>
      </Show>
      <Show when={data()} fallback={<p>Loading…</p>}>
        {loaded => (
          <div>
            <Header count={shown().length} portfolio={portfolio()} />
            <StockList stocks={shown()} quotes={loaded().quotes} />
          </div>
        )}
      </Show>
    </div>
  )
}
