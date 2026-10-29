import { createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show } from 'solid-js'
import type { Api, Holding, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { createLiveFavorites, type LiveFavorite } from './lib/favorites'
import { createLiveQuotes, type LiveQuote } from './lib/live'
import { readStored, writeStored } from './lib/storage'

type Loaded = {
  stocks: Stock[]
  holdings: Holding[]
  quotes: Map<string, LiveQuote>
  favorites: Map<string, LiveFavorite>
}

const SEARCH_KEY = 'watchlist:search'
const FAVORITES_ONLY_KEY = 'watchlist:favoritesOnly'

export function App(props: { api: Api }) {
  const [data] = createResource(() =>
    Promise.all([props.api.listStocks(), props.api.listHoldings()]).then(
      ([list, holdings]): Loaded => ({
        stocks: list,
        holdings,
        quotes: createLiveQuotes(list),
        favorites: createLiveFavorites(list),
      }),
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
  // The text and the favorites-only setting are kept in localStorage and restored on load.
  const [query, setQuery] = createSignal(readStored(SEARCH_KEY) ?? '')
  const [favoritesOnly, setFavoritesOnly] = createSignal(readStored(FAVORITES_ONLY_KEY) === '1')
  createEffect(() => writeStored(SEARCH_KEY, query()))
  createEffect(() => writeStored(FAVORITES_ONLY_KEY, favoritesOnly() ? '1' : '0'))

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

  // Rows for the stocks that match the search and, if set, are favorites, in list order. The stock objects
  // are the same as in the full list, so rows that stay are reused instead of being rendered again.
  const shown = createMemo(() => {
    const d = data()
    if (!d) return []
    const ids = results()
    const match = ids ? new Set(ids) : undefined
    const onlyFavs = favoritesOnly()
    return d.stocks.filter(
      s => (!match || match.has(s.id)) && (!onlyFavs || d.favorites.get(s.id)!.favorite()),
    )
  })

  // Favorite toggles. The star changes at once; a failed save puts it back unless it was clicked again since.
  const [saveErrors, setSaveErrors] = createSignal<string[]>([])

  function toggleFavorite(stock: Stock) {
    const d = data()
    if (!d) return
    const fav = d.favorites.get(stock.id)!
    const before = fav.favorite()
    const token = fav.click(!before)
    setSaveErrors(list => list.filter(sym => sym !== stock.symbol))
    props.api.setFavorite(stock.id, !before).then(
      () => {},
      () => {
        fav.revert(token, before)
        setSaveErrors(list => (list.includes(stock.symbol) ? list : [...list, stock.symbol]))
      },
    )
  }

  return (
    <div>
      <label>
        Search <input type="text" value={query()} onInput={e => setQuery(e.currentTarget.value)} />
      </label>
      <label>
        <input type="checkbox" checked={favoritesOnly()} onChange={e => setFavoritesOnly(e.currentTarget.checked)} />{' '}
        Favorites only
      </label>
      <Show when={searchState() === 'pending'}>
        <p role="status">Searching…</p>
      </Show>
      <Show when={searchState() === 'error'}>
        <p role="alert">Search failed</p>
      </Show>
      <For each={saveErrors()}>{sym => <p role="alert">{`Couldn't update ${sym}`}</p>}</For>
      <Show when={data()} fallback={<p>Loading…</p>}>
        {loaded => (
          <div>
            <Header count={shown().length} portfolio={portfolio()} />
            <StockList
              stocks={shown()}
              quotes={loaded().quotes}
              favorites={loaded().favorites}
              onToggle={toggleFavorite}
            />
          </div>
        )}
      </Show>
    </div>
  )
}
