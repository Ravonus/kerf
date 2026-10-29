import { derived, flush, state, watch } from 'weft'
import type { Api, Holding, Quotes, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { money } from './lib/format'
import { stored, store } from './lib/storage'

/** Prices kept per stock for its sparkline. */
const HISTORY = 20

type Detail = { token: number; id: string; status: 'loading' | 'ready' | 'error'; description: string }
type Save = { id: string; prev: string }

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const quotes = state<Quotes>({})
  const portfolio = derived(() => holdings.value.reduce((sum, h) => sum + h.qty * (quotes.get(h.id)?.price ?? 0), 0))

  // Favorites. `clicks` counts each stock's clicks, so a failed save only reverts if no later click happened.
  const favorites = state<Record<string, boolean>>({})
  const favoriteError = state<string | null>(null)
  const clicks = new Map<string, number>()

  // Search and filter. `matches` is the latest answer (null: no search, show every stock).
  const query = state(stored('watchlist.search', ''))
  const favoritesOnly = state(stored('watchlist.favoritesOnly', 'false') === 'true')
  const trimmed = derived(() => query.value.trim())
  const matches = state<string[] | null>(null)
  const searching = state(false)
  const searchFailed = state(false)
  const shown = derived((): Stock[] => {
    const all = stocks.value
    if (!all) return []
    const ids = matches.value
    const keep = ids === null ? null : new Set(ids)
    return all.filter(s => (keep === null || keep.has(s.id)) && (!favoritesOnly.value || favorites.get(s.id)))
  })

  // Details panel: the open stock's id, its loaded description, its price, and the notes.
  const open = state<string | null>(null)
  const openStock = derived(() => stocks.value?.find(s => s.id === open.value))
  const openPrice = derived((): number | null => {
    const id = open.value
    return id === null ? null : (quotes.get(id)?.price ?? null)
  })
  const detail = state<Detail | null>(null)
  const notes = state<Record<string, string>>({})
  const draft = state('')
  const undoStack = state<Save[]>([])
  let opener: HTMLElement | null = null
  let notesBox!: HTMLTextAreaElement
  let loadSeq = 0

  watch(() => query.value, q => store('watchlist.search', q))
  watch(() => favoritesOnly.value, on => store('watchlist.favoritesOnly', String(on)))

  watch(() => api, source => {
    let live = true
    Promise.all([source.listStocks(), source.listHoldings()]).then(([list, held]) => {
      if (!live) return
      quotes.value = Object.fromEntries(list.map(s => [s.id, { price: s.price, history: [s.price] }]))
      favorites.value = Object.fromEntries(list.map(s => [s.id, s.favorite]))
      holdings.value = held
      stocks.value = list
    })
    const unsubscribe = source.subscribeQuotes(({ id, price }) => {
      if (!live) return
      const q = quotes.value[id]
      if (!q) return // not loaded yet
      quotes.value = { ...quotes.value, [id]: { price, history: [...q.history, price].slice(-HISTORY) } }
    })
    return () => {
      live = false
      unsubscribe()
    }
  })

  // One request per change of the trimmed text. Changing it again aborts the request in flight.
  watch(() => trimmed.value, text => {
    if (!text) {
      matches.value = null
      searching.value = false
      return
    }
    const ctrl = new AbortController()
    searching.value = true
    api.search(text, ctrl.signal).then(ids => {
      if (ctrl.signal.aborted) return
      matches.value = ids
      searchFailed.value = false
      searching.value = false
    }, () => {
      if (ctrl.signal.aborted) return
      searchFailed.value = true
      searching.value = false
    })
    return () => ctrl.abort()
  })

  // Show the new star at once, then save. A refused save puts the star back, unless this star was clicked again.
  const toggleFavorite = (stock: Stock) => {
    const id = stock.id
    const before = favorites.get(id)
    const next = !before
    const click = (clicks.get(id) ?? 0) + 1
    clicks.set(id, click)
    favorites.value = { ...favorites.value, [id]: next }
    api.setFavorite(id, next).catch(() => {
      if (clicks.get(id) === click) favorites.value = { ...favorites.value, [id]: before }
      favoriteError.value = `Couldn't update ${stock.symbol}`
    })
  }

  // Loads the open stock's description. A response is shown only if its request is still the latest.
  const load = (id: string) => {
    const token = ++loadSeq
    detail.value = { token, id, status: 'loading', description: '' }
    api.details(id).then(d => {
      if (detail.value?.token !== token) return
      detail.value = { token, id, status: 'ready', description: d.description }
    }, () => {
      if (detail.value?.token !== token) return
      detail.value = { token, id, status: 'error', description: '' }
    })
  }

  const openDetails = (stock: Stock, button: HTMLElement) => {
    opener = button
    open.value = stock.id
    draft.value = notes.get(stock.id) ?? ''
    load(stock.id)
    flush() // the panel is in the DOM now
    notesBox.focus()
  }

  const closeDetails = () => {
    const back = opener
    open.value = null
    detail.value = null
    back?.focus()
  }

  const onPanelKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') closeDetails()
  }

  const retry = () => {
    if (open.value !== null) load(open.value)
  }

  const save = () => {
    const id = open.value
    if (id === null) return
    undoStack.value = [...undoStack.value, { id, prev: notes.get(id) ?? '' }]
    notes.value = { ...notes.value, [id]: draft.value }
  }

  const undo = () => {
    const last = undoStack.value.at(-1)
    if (!last) return
    undoStack.value = undoStack.value.slice(0, -1)
    notes.value = { ...notes.value, [last.id]: last.prev }
    if (open.value === last.id) draft.value = last.prev
  }

  return (
    <>
      {!stocks.value ? (
        <p>Loading…</p>
      ) : (
        <div>
          <Header count={shown.value.length} portfolio={portfolio.value} />
          <label>
            <input type="text" aria-label="Search" value={query.value} onInput={e => (query.value = e.currentTarget.value)} />
          </label>
          <label>
            <input type="checkbox" checked={favoritesOnly.value} onChange={e => (favoritesOnly.value = e.currentTarget.checked)} />
            Favorites only
          </label>
          {searching.value && <p role="status">Searching…</p>}
          {searchFailed.value && <p role="alert">Search failed</p>}
          {favoriteError.value && <p role="alert">{favoriteError.value}</p>}
          <StockList
            stocks={shown.value}
            quotes={quotes}
            favorites={favorites}
            onToggle={toggleFavorite}
            onOpen={openDetails}
          />
          {open.value !== null && (
            <section role="region" aria-label="Details" onKeyDown={onPanelKey}>
              <h2>{openStock.value?.symbol} {openStock.value?.name}</h2>
              <p data-testid="detail-price">{openPrice.value === null ? '' : money(openPrice.value)}</p>
              {detail.value?.status === 'loading' && <p>Loading…</p>}
              {detail.value?.status === 'ready' && <p>{detail.value.description}</p>}
              {detail.value?.status === 'error' && (
                <>
                  <p role="alert">Couldn't load details</p>
                  <button type="button" onClick={retry}>Retry</button>
                </>
              )}
              <label>
                Notes
                <textarea ref={notesBox} value={draft.value} onInput={e => (draft.value = e.currentTarget.value)} />
              </label>
              <button type="button" onClick={save}>Save</button>
              <button type="button" onClick={undo} disabled={undoStack.value.length === 0}>Undo</button>
            </section>
          )}
        </div>
      )}
    </>
  )
}
