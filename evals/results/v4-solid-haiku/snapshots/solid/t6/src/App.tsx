import { batch, createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show } from 'solid-js'
import type { Api, Holding, Quote, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { createLiveFavorites, type LiveFavorite } from './lib/favorites'
import { money } from './lib/format'
import { createLiveQuotes, type LiveQuote } from './lib/live'
import { readStored, writeStored } from './lib/storage'
import { createTab, parseTabKey, TAB_KEY, TAB_KEYS, type SortBy, type Tab } from './lib/tabs'

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

  // Tabs. Each has its own search, favorites-only and sort, kept in localStorage.
  const tabs = Object.fromEntries(TAB_KEYS.map(k => [k, createTab(k)])) as Record<string, Tab>
  const [tabKey, setTabKey] = createSignal(parseTabKey(readStored(TAB_KEY)))
  createEffect(() => writeStored(TAB_KEY, tabKey()))
  const tab = createMemo(() => tabs[tabKey()])

  // A tab's search runs against the server and is not aborted when another tab is shown. Only a newer query
  // in the same tab replaces it.
  function runSearch(t: Tab, q: string) {
    t.lastQuery = q
    t.searched = true
    t.controller?.abort()
    t.controller = undefined
    if (!q) {
      t.setResults(null)
      t.setSearchState('idle')
      return
    }
    const ctrl = new AbortController()
    t.controller = ctrl
    t.setSearchState('pending')
    props.api.search(q, ctrl.signal).then(
      ids => {
        if (ctrl.signal.aborted) return
        t.setResults(ids)
        t.setSearchState('idle')
      },
      () => {
        if (ctrl.signal.aborted) return
        t.setSearchState('error')
      },
    )
  }

  // A restored search runs when its tab is first shown.
  createEffect(
    on(tabKey, key => {
      const t = tabs[key]
      if (!t.searched) runSearch(t, t.query().trim())
    }),
  )

  function onSearchInput(text: string) {
    const t = tab()
    t.setQuery(text)
    const q = text.trim()
    if (q !== t.lastQuery) runSearch(t, q)
  }

  // Rows for the stocks of the current tab that match its search and, if set, are favorites, in its sort order.
  // The stock objects are the same as in the full list, so rows that stay are reused instead of rendered again.
  const shown = createMemo(() => {
    const d = data()
    if (!d) return []
    const t = tab()
    const ids = t.results()
    const match = ids ? new Set(ids) : undefined
    const onlyFavs = t.favoritesOnly()
    const sector = t.key
    const list = d.stocks.filter(
      s =>
        (sector === 'all' || s.sector === sector) &&
        (!match || match.has(s.id)) &&
        (!onlyFavs || d.favorites.get(s.id)!.favorite()),
    )
    if (t.sortBy() === 'symbol') return list
    // Biggest gain first. Reads the live prices, so the order follows the quotes. Plain numbers, not the
    // formatter. Array sort is stable, so ties keep list order.
    const gain = (s: Stock) => (d.quotes.get(s.id)!.price() - s.prevClose) / s.prevClose
    return list.map(s => ({ s, g: gain(s) })).sort((a, b) => b.g - a.g).map(x => x.s)
  })

  // Favorite toggles. The star changes at once; a failed save puts it back unless it was clicked again since.
  // Favorites are shared by all tabs.
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
      <nav aria-label="Sectors">
        <For each={TAB_KEYS}>
          {key => (
            <button
              type="button"
              aria-pressed={tabKey() === key ? 'true' : 'false'}
              onClick={() => setTabKey(key)}
            >
              {key === 'all' ? 'All' : key}
            </button>
          )}
        </For>
      </nav>
      <label>
        Search <input type="text" value={tab().query()} onInput={e => onSearchInput(e.currentTarget.value)} />
      </label>
      <label>
        <input
          type="checkbox"
          checked={tab().favoritesOnly()}
          onChange={e => tab().setFavoritesOnly(e.currentTarget.checked)}
        />{' '}
        Favorites only
      </label>
      <label for="sort">Sort</label>
      <select id="sort" value={tab().sortBy()} onChange={e => tab().setSortBy(e.currentTarget.value as SortBy)}>
        <option value="symbol">Symbol</option>
        <option value="change">Change</option>
      </select>
      <Show when={tab().searchState() === 'pending'}>
        <p role="status">Searching…</p>
      </Show>
      <Show when={tab().searchState() === 'error'}>
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
