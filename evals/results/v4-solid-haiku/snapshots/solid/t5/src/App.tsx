import { batch, createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show } from 'solid-js'
import type { Api, Holding, Quote, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { money } from './lib/format'
import { createLiveFavorites, type LiveFavorite } from './lib/favorites'
import { createLiveQuotes, type LiveQuote } from './lib/live'
import { readStored, writeStored } from './lib/storage'

type Loaded = {
  stocks: Stock[]
  holdings: Holding[]
  quotes: Map<string, LiveQuote>
  favorites: Map<string, LiveFavorite>
}

/** The details panel: which stock is open and the state of its description. */
type Detail = { id: string; token: number; status: 'loading' | 'ready' | 'error'; description: string }

/** One saved note and what the note was before that save, for undo. */
type Save = { id: string; previous: string }

const SEARCH_KEY = 'watchlist:search'
const FAVORITES_ONLY_KEY = 'watchlist:favoritesOnly'
const SORT_KEY = 'watchlist:sort'

type SortBy = 'symbol' | 'change'

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

  // Quotes arrive in bursts. They are queued and applied together in one batch per microtask, so each changed
  // row and the portfolio are formatted once per burst. Quotes before the list has loaded are dropped.
  let queued: Quote[] = []
  let scheduled = false
  let closed = false
  function applyQueued() {
    scheduled = false
    const burst = queued
    queued = []
    const d = data()
    if (closed || !d) return
    batch(() => {
      for (const q of burst) d.quotes.get(q.id)?.apply(q.price)
    })
  }
  const unsubscribe = props.api.subscribeQuotes(q => {
    queued.push(q)
    if (!scheduled) {
      scheduled = true
      queueMicrotask(applyQueued)
    }
  })
  onCleanup(() => {
    closed = true
    unsubscribe()
  })

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
  const [sortBy, setSortBy] = createSignal<SortBy>(readStored(SORT_KEY) === 'change' ? 'change' : 'symbol')
  createEffect(() => writeStored(SORT_KEY, sortBy()))

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
    const list = d.stocks.filter(
      s => (!match || match.has(s.id)) && (!onlyFavs || d.favorites.get(s.id)!.favorite()),
    )
    if (sortBy() === 'symbol') return list
    // Biggest gain first. Reads the live prices, so the order follows the quotes. Plain numbers, not the
    // formatter. Array sort is stable, so ties keep list order.
    const gain = (s: Stock) => (d.quotes.get(s.id)!.price() - s.prevClose) / s.prevClose
    return list.map(s => ({ s, g: gain(s) })).sort((a, b) => b.g - a.g).map(x => x.s)
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

  // Details panel. A token identifies the latest load; a description from an older load is dropped.
  const [detail, setDetail] = createSignal<Detail | null>(null)
  let detailToken = 0
  let opener: HTMLButtonElement | undefined
  let notesEl: HTMLTextAreaElement | undefined

  const openId = createMemo(() => detail()?.id)
  const openStock = createMemo(() => {
    const id = openId()
    return id === undefined ? undefined : data()?.stocks.find(s => s.id === id)
  })
  // Recomputed only when the open stock or its price changes.
  const detailPrice = createMemo(() => {
    const id = openId()
    const quote = id === undefined ? undefined : data()?.quotes.get(id)
    return quote ? money(quote.price()) : ''
  })

  function loadDetails(id: string) {
    const token = ++detailToken
    setDetail({ id, token, status: 'loading', description: '' })
    props.api.details(id).then(
      d => {
        if (token === detailToken) setDetail({ id, token, status: 'ready', description: d.description })
      },
      () => {
        if (token === detailToken) setDetail({ id, token, status: 'error', description: '' })
      },
    )
  }

  function openDetails(stock: Stock, button: HTMLButtonElement) {
    opener = button
    if (openId() === stock.id) return
    loadDetails(stock.id)
  }

  function closeDetails() {
    detailToken++
    setDetail(null)
    opener?.focus()
  }

  // Opening a panel puts the cursor in its Notes.
  createEffect(
    on(openId, id => {
      if (id !== undefined) notesEl?.focus()
    }),
  )

  // Notes per stock, and the saves to undo. Undo restores the note a save replaced.
  const [notes, setNotes] = createSignal<Map<string, string>>(new Map())
  const [saves, setSaves] = createSignal<Save[]>([])

  // The open stock's id and saved note. Equal values are not propagated, so the textarea is only reset when
  // the open stock changes or its saved note changes.
  const noteView = createMemo(
    () => {
      const id = openId()
      return { id, text: id === undefined ? '' : (notes().get(id) ?? '') }
    },
    undefined,
    { equals: (a, b) => a.id === b.id && a.text === b.text },
  )

  function saveNote() {
    const id = openId()
    if (id === undefined || !notesEl) return
    const previous = notes().get(id) ?? ''
    const text = notesEl.value
    setSaves(list => [...list, { id, previous }])
    setNotes(m => new Map(m).set(id, text))
  }

  function undoSave() {
    const list = saves()
    const last = list[list.length - 1]
    if (!last) return
    setSaves(list.slice(0, -1))
    setNotes(m => new Map(m).set(last.id, last.previous))
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
      <label for="sort">Sort</label>
      <select id="sort" value={sortBy()} onChange={e => setSortBy(e.currentTarget.value as SortBy)}>
        <option value="symbol">Symbol</option>
        <option value="change">Change</option>
      </select>
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
              onDetails={openDetails}
            />
            <Show when={openStock()}>
              {stock => (
                <section
                  role="region"
                  aria-label="Details"
                  onKeyDown={e => {
                    if (e.key === 'Escape') closeDetails()
                  }}
                >
                  <h2>
                    {stock().symbol} {stock().name}
                  </h2>
                  <p data-testid="detail-price">{detailPrice()}</p>
                  <Show when={detail()?.status === 'loading'}>
                    <p>Loading…</p>
                  </Show>
                  <Show when={detail()?.status === 'ready'}>
                    <p>{detail()?.description}</p>
                  </Show>
                  <Show when={detail()?.status === 'error'}>
                    <p role="alert">Couldn't load details</p>
                    <button type="button" onClick={() => loadDetails(stock().id)}>
                      Retry
                    </button>
                  </Show>
                  <label>
                    Notes <textarea ref={notesEl} value={noteView().text} />
                  </label>
                  <button type="button" onClick={saveNote}>
                    Save
                  </button>
                  <button type="button" onClick={undoSave} disabled={saves().length === 0}>
                    Undo
                  </button>
                  <button type="button" onClick={closeDetails}>
                    Close
                  </button>
                </section>
              )}
            </Show>
          </div>
        )}
      </Show>
    </div>
  )
}
