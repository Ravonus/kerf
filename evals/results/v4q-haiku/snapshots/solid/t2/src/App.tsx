import { batch, createEffect, createMemo, createResource, createSignal, onCleanup, Show } from 'solid-js'
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

  // Search. `null` means no search is active (empty text): every stock is shown.
  const [text, setText] = createSignal('')
  const [results, setResults] = createSignal<string[] | null>(null)
  const [pending, setPending] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  let current: AbortController | undefined

  createEffect(() => {
    const query = text().trim()
    current?.abort()
    current = undefined
    if (!query) {
      setResults(null)
      setPending(false)
      setFailed(false)
      return
    }
    const ctrl = new AbortController()
    current = ctrl
    setPending(true)
    props.api.search(query, ctrl.signal).then(
      ids => {
        if (ctrl.signal.aborted) return
        setResults(ids)
        setFailed(false)
        setPending(false)
      },
      () => {
        if (ctrl.signal.aborted) return
        setFailed(true)
        setPending(false)
      },
    )
  })
  onCleanup(() => current?.abort())

  const visible = createMemo(() => {
    const d = data()
    if (!d) return []
    const ids = results()
    if (!ids) return d.stocks
    const keep = new Set(ids)
    return d.stocks.filter(s => keep.has(s.id))
  })

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {_loaded => (
        <div>
          <Header count={visible().length} portfolio={portfolio()} />
          <label>
            Search <input type="text" value={text()} onInput={e => setText(e.currentTarget.value)} />
          </label>
          <Show when={pending()}>
            <p role="status">Searching…</p>
          </Show>
          <Show when={failed()}>
            <p role="alert">Search failed</p>
          </Show>
          <StockList stocks={visible()} live={live} />
        </div>
      )}
    </Show>
  )
}
