import { createMemo, For, createResource, createSignal, onCleanup, Show } from 'solid-js'
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
  const load = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
  const save = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} }
  const [text, setText] = createSignal('')
  const [favOnly, setFavOnly] = createSignal(load('watchlist.favOnly') === '1')
  const [favErrors, setFavErrors] = createSignal<Record<string, string>>({})
  const [matches, setMatches] = createSignal<Set<string> | null>(null)
  const [pendingSearch, setPendingSearch] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  let controller: AbortController | undefined
  let current = ''
  onCleanup(() => controller?.abort())

  function onSearch(value: string) {
    setText(value)
    save('watchlist.search', value)
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

  const saved = load('watchlist.search')
  if (saved) onSearch(saved)

  function toggle(id: string) {
    const l = live?.byId.get(id)
    if (!l) return
    const stock = stocksById.get(id)!
    const prev = l.favorite()
    const click = ++l.clicks
    l.setFavorite(!prev)
    setFavErrors(e => { const { [id]: _, ...rest } = e; return rest })
    props.api.setFavorite(id, !prev).catch(() => {
      if (l.clicks === click) {
        l.setFavorite(prev)
      }
      setFavErrors(e => ({ ...e, [id]: `Couldn't update ${stock.symbol}` }))
    })
  }
  const stocksById = new Map<string, { symbol: string }>()

  const [data] = createResource(() =>
    Promise.all([props.api.listStocks(), props.api.listHoldings()]).then(([stocks, holdings]) => {
      live = createLive(stocks, holdings)
      for (const st of stocks) stocksById.set(st.id, st)
      for (const q of pending.splice(0)) live.byId.get(q.id)?.push(q.price)
      return { stocks, live }
    }),
  )

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {loaded => {
        const shown = createMemo(() => {
          const m = matches()
          const fo = favOnly()
          const byId = loaded().live.byId
          return m || fo ? loaded().stocks.filter(s => (!m || m.has(s.id)) && (!fo || byId.get(s.id)!.favorite())) : loaded().stocks
        })
        return (
          <div>
            <Header count={shown().length} portfolio={loaded().live.portfolio()} />
            <label>
              Search
              <input type="search" value={text()} onInput={e => onSearch(e.currentTarget.value)} />
            </label>
            <label>
              <input
                type="checkbox"
                checked={favOnly()}
                onChange={e => { setFavOnly(e.currentTarget.checked); save('watchlist.favOnly', e.currentTarget.checked ? '1' : '0') }}
              />
              Favorites only
            </label>
            <For each={Object.values(favErrors())}>{msg => <p role="alert">{msg}</p>}</For>
            <Show when={pendingSearch()}>
              <p role="status">Searching…</p>
            </Show>
            <Show when={failed()}>
              <p role="alert">Search failed</p>
            </Show>
            <StockList stocks={shown()} live={loaded().live.byId} onToggle={toggle} />
          </div>
        )
      }}
    </Show>
  )
}
