import { createMemo, createResource, createSignal, onCleanup, Show } from 'solid-js'
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

  // Search: only the latest query's outcome is ever applied.
  const [text, setText] = createSignal('')
  const [matches, setMatches] = createSignal<Set<string> | null>(null)
  const [pendingSearch, setPendingSearch] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  let controller: AbortController | undefined
  let current = ''
  onCleanup(() => controller?.abort())

  function onSearch(value: string) {
    setText(value)
    const q = value.trim()
    if (q === current) return
    current = q
    controller?.abort()
    controller = undefined
    if (q === '') {
      setMatches(null)
      setPendingSearch(false)
      setFailed(false)
      return
    }
    const mine = (controller = new AbortController())
    setPendingSearch(true)
    props.api.search(q, mine.signal).then(
      ids => {
        if (controller !== mine) return
        setMatches(new Set(ids))
        setFailed(false)
        setPendingSearch(false)
      },
      () => {
        if (controller !== mine) return
        setFailed(true)
        setPendingSearch(false)
      },
    )
  }

  const [data] = createResource(() =>
    Promise.all([props.api.listStocks(), props.api.listHoldings()]).then(([stocks, holdings]) => {
      live = createLive(stocks, holdings)
      for (const q of pending.splice(0)) live.byId.get(q.id)?.push(q.price)
      return { stocks, live }
    }),
  )

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {loaded => {
        const shown = createMemo(() => {
          const m = matches()
          return m ? loaded().stocks.filter(s => m.has(s.id)) : loaded().stocks
        })
        return (
          <div>
            <Header count={shown().length} portfolio={loaded().live.portfolio()} />
            <label>
              Search
              <input type="search" value={text()} onInput={e => onSearch(e.currentTarget.value)} />
            </label>
            <Show when={pendingSearch()}>
              <p role="status">Searching…</p>
            </Show>
            <Show when={failed()}>
              <p role="alert">Search failed</p>
            </Show>
            <StockList stocks={shown()} live={loaded().live.byId} />
          </div>
        )
      }}
    </Show>
  )
}
