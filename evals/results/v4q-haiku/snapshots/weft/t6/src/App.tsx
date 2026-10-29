import { derived, flush, state, watch } from 'weft'
import type { Api, Holding, Quotes, Stock } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { money } from './lib/format'
import { store } from './lib/storage'
import { TABS, restoreTab, restoreViews, type Tab, type View } from './lib/views'

/** Prices kept per stock for its sparkline. */
const HISTORY = 20

type Detail = { token: number; id: string; status: 'loading' | 'ready' | 'error'; description: string }
type Save = { id: string; prev: string }
/** One tab's search: the latest answer (null: no search, show every stock), and its state. */
type Results = { matches: string[] | null; searching: boolean; failed: boolean }

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const quotes = state<Quotes>({})
  const portfolio = derived(() => holdings.value.reduce((sum, h) => sum + h.qty * (quotes.get(h.id)?.price ?? 0), 0))

  // Favorites are shared by all tabs. `clicks` counts each stock's clicks, so a failed save only reverts if no later click happened.
  const favorites = state<Record<string, boolean>>({})
  const favoriteError = state<string | null>(null)
  const clicks = new Map<string, number>()

  // Tabs. Each tab keeps its own settings and its own search.
  const tab = state<Tab>(restoreTab())
  const views = state<Record<Tab, View>>(restoreViews())
  const results = state<Record<Tab, Results>>(
    Object.fromEntries(TABS.map(t => [t, { matches: null, searching: false, failed: false }])) as Record<Tab, Results>,
  )
  const view = derived(() => views.get(tab.value))
  const result = derived(() => results.get(tab.value))
  const shown = derived((): Stock[] => {
    const all = stocks.value
    if (!all) return []
    const t = tab.value
    const v = view.value
    const r = result.value
    const keep = r.matches === null ? null : new Set(r.matches)
    const list = all.filter(s => (t === 'All' || s.sector === t) && (keep === null || keep.has(s.id)) && (!v.favoritesOnly || favorites.get(s.id)))
    if (v.sort !== 'change') return list // list order: no quote is read, so quotes don't re-sort
    // Biggest gain first. Changes compare at the precision shown (hundredths of a percent), so stocks that display
    // the same change tie, and the stable sort keeps them in list order.
    const change = new Map(list.map(s => [s.id, Math.round((((quotes.get(s.id)?.price ?? s.price) - s.prevClose) / s.prevClose) * 10000)]))
    return list.sort((a, b) => change.get(b.id)! - change.get(a.id)!)
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

  watch(() => views.value, v => store('watchlist.views', JSON.stringify(v)))

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

  // Searches. Each tab has at most one request in flight: a newer query in the same tab aborts it. Switching tabs
  // aborts nothing, so a tab's answer is kept and shown when the tab comes back.
  const controllers = new Map<Tab, AbortController>()
  const searched = new Map<Tab, string>() // the trimmed text each tab last searched for

  const patchView = (t: Tab, patch: Partial<View>) => {
    views.value = { ...views.value, [t]: { ...views.value[t], ...patch } }
  }
  const patchResult = (t: Tab, patch: Partial<Results>) => {
    results.value = { ...results.value, [t]: { ...results.value[t], ...patch } }
  }

  const runSearch = (t: Tab, text: string) => {
    controllers.get(t)?.abort()
    const ctrl = new AbortController()
    controllers.set(t, ctrl)
    searched.set(t, text)
    patchResult(t, { searching: true })
    api.search(text, ctrl.signal).then(ids => {
      if (ctrl.signal.aborted) return
      patchResult(t, { matches: ids, searching: false, failed: false })
    }, () => {
      if (ctrl.signal.aborted) return
      patchResult(t, { searching: false, failed: true })
    })
  }

  const clearSearch = (t: Tab) => {
    controllers.get(t)?.abort()
    controllers.delete(t)
    searched.delete(t)
    patchResult(t, { matches: null, searching: false })
  }

  const typeQuery = (text: string) => {
    const t = tab.value
    patchView(t, { query: text })
    const trimmed = text.trim()
    if (!trimmed) clearSearch(t)
    else if (trimmed !== searched.get(t)) runSearch(t, trimmed)
  }

  // Runs when a tab is shown: at startup for the saved tab, later for any other tab. A restored search runs once,
  // the first time its tab is shown.
  watch(() => tab.value, t => {
    store('watchlist.tab', t)
    const text = views.value[t].query.trim()
    if (text && searched.get(t) !== text) runSearch(t, text)
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
          <div>
            {TABS.map(t => (
              <button key={t} type="button" aria-pressed={tab.value === t ? 'true' : 'false'} onClick={() => (tab.value = t)}>
                {t}
              </button>
            ))}
          </div>
          <label>
            <input type="text" aria-label="Search" value={view.value.query} onInput={e => typeQuery(e.currentTarget.value)} />
          </label>
          <label>
            <input type="checkbox" checked={view.value.favoritesOnly} onChange={e => patchView(tab.value, { favoritesOnly: e.currentTarget.checked })} />
            Favorites only
          </label>
          <label>
            Sort
            <select
              aria-label="Sort"
              value={view.value.sort}
              onChange={e => patchView(tab.value, { sort: e.currentTarget.value === 'change' ? 'change' : 'symbol' })}
            >
              <option value="symbol">Symbol</option>
              <option value="change">Change</option>
            </select>
          </label>
          {result.value.searching && <p role="status">Searching…</p>}
          {result.value.failed && <p role="alert">Search failed</p>}
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
