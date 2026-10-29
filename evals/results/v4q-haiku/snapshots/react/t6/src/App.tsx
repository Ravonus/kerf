import { useCallback, useEffect, useMemo, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import type { Api, Sector, Stock } from './api'
import { DetailsPanel } from './components/DetailsPanel'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { QuoteContext, QuoteStore } from './quotes'

const VIEW_KEY = 'watchlist.view'

const TABS = ['All', 'tech', 'energy', 'health', 'finance'] as const
type TabKey = (typeof TABS)[number]
type SortKey = 'symbol' | 'change'

/** Per-tab settings and search state. Only the settings (query, favoritesOnly, sort) are persisted. */
type TabState = {
  query: string
  favoritesOnly: boolean
  sort: SortKey
  /** Ids from the latest successful search for this tab, or null for "no search". */
  results: string[] | null
  pending: boolean
  failed: boolean
}

type NotesState = {
  notes: Record<string, string>
  /** Every save, most recent last. `previous` is undefined when the stock had no note before. */
  history: { id: string; previous: string | undefined }[]
}
type NotesAction = { type: 'save'; id: string; text: string } | { type: 'undo' }

function notesReducer(state: NotesState, action: NotesAction): NotesState {
  if (action.type === 'save') {
    const previous: string | undefined = state.notes[action.id]
    return {
      notes: { ...state.notes, [action.id]: action.text },
      history: [...state.history, { id: action.id, previous }],
    }
  }
  const last = state.history[state.history.length - 1]
  if (!last) return state
  const notes = { ...state.notes }
  if (last.previous === undefined) delete notes[last.id]
  else notes[last.id] = last.previous
  return { notes, history: state.history.slice(0, -1) }
}

// Storage can be unavailable (private mode, blocked cookies); the app still works without persistence.
type SavedView = {
  selected?: unknown
  tabs?: Record<string, { query?: unknown; favoritesOnly?: unknown; sort?: unknown } | undefined>
}
function loadView(): SavedView {
  try {
    const raw = localStorage.getItem(VIEW_KEY)
    return raw ? (JSON.parse(raw) as SavedView) : {}
  } catch {
    return {}
  }
}
function saveView(view: unknown) {
  try { localStorage.setItem(VIEW_KEY, JSON.stringify(view)) } catch { /* not persisted */ }
}

function initialTabs(saved: SavedView): Record<TabKey, TabState> {
  const out = {} as Record<TabKey, TabState>
  for (const key of TABS) {
    const s = saved.tabs?.[key] ?? {}
    out[key] = {
      query: typeof s.query === 'string' ? s.query : '',
      favoritesOnly: s.favoritesOnly === true,
      sort: s.sort === 'change' ? 'change' : 'symbol',
      results: null,
      pending: false,
      failed: false,
    }
  }
  return out
}

const noSubscribe = () => () => {}

/** Biggest gain first. Ties keep list order, since `Array.prototype.sort` is stable. */
function sortByChange(stocks: Stock[], store: QuoteStore): Stock[] {
  const change = new Map(stocks.map(s => {
    const price = store.getQuote(s.id)?.price ?? s.price
    return [s.id, (price - s.prevClose) / s.prevClose] as const
  }))
  return [...stocks].sort((a, b) => change.get(b.id)! - change.get(a.id)!)
}

export function App({ api }: { api: Api }) {
  const [store] = useState(() => new QuoteStore())
  const [stocks, setStocks] = useState<Stock[] | null>(null)
  const portfolio = useSyncExternalStore(store.subscribePortfolio, store.getPortfolio)

  const [saved] = useState(loadView)
  const [selected, setSelected] = useState<TabKey>(() =>
    TABS.includes(saved.selected as TabKey) ? (saved.selected as TabKey) : 'All')
  const [tabs, setTabs] = useState(() => initialTabs(saved))
  const tab = tabs[selected]

  const patchTab = useCallback((key: TabKey, patch: Partial<TabState>) => {
    setTabs(t => ({ ...t, [key]: { ...t[key], ...patch } }))
  }, [])

  // Each tab has its own search. A new query in a tab aborts that tab's previous request only.
  // Switching tabs never aborts anything, so a search keeps going and its results wait for the tab.
  const controllers = useRef(new Map<TabKey, AbortController>())
  // Tabs whose search has been started this session; a restored search runs when its tab is first shown.
  const started = useRef(new Set<TabKey>())

  const startSearch = useCallback((key: TabKey, raw: string) => {
    controllers.current.get(key)?.abort()
    controllers.current.delete(key)
    started.current.add(key)
    const text = raw.trim()
    if (!text) {
      patchTab(key, { results: null, pending: false, failed: false })
      return
    }
    const controller = new AbortController()
    controllers.current.set(key, controller)
    patchTab(key, { pending: true })
    api.search(text, controller.signal).then(
      ids => {
        if (controller.signal.aborted) return
        controllers.current.delete(key)
        patchTab(key, { results: ids, pending: false, failed: false })
      },
      () => {
        if (controller.signal.aborted) return
        controllers.current.delete(key)
        patchTab(key, { pending: false, failed: true })
      },
    )
  }, [api, patchTab])

  useEffect(() => () => { controllers.current.forEach(c => c.abort()) }, [])

  // Re-render on every quote only while the selected tab sorts by change, since that order depends on all prices.
  useSyncExternalStore(tab.sort === 'change' ? store.subscribeAll : noSubscribe, store.getVersion)

  // Favorite flags shown on screen (optimistic). A ref mirrors them so click handlers read the latest value.
  const [favorites, setFavorites] = useState<Record<string, boolean>>({})
  const favoritesRef = useRef(favorites)
  // symbol by id, for stocks whose last save failed.
  const [saveErrors, setSaveErrors] = useState<Record<string, string>>({})
  const clickCount = useRef(0)
  const latestClick = useRef(new Map<string, number>())

  // Details panel: the open stock, a token that moves focus on each open, and the element to refocus on close.
  const [openStock, setOpenStock] = useState<Stock | null>(null)
  const [focusToken, setFocusToken] = useState(0)
  const opener = useRef<HTMLElement | null>(null)
  const [notesState, dispatchNotes] = useReducer(notesReducer, { notes: {}, history: [] })

  useEffect(() => {
    saveView({
      selected,
      tabs: Object.fromEntries(TABS.map(k => [k, {
        query: tabs[k].query,
        favoritesOnly: tabs[k].favoritesOnly,
        sort: tabs[k].sort,
      }])),
    })
  }, [selected, tabs])

  // One quote subscription for the whole app, closed on unmount.
  useEffect(() => api.subscribeQuotes(q => store.push(q.id, q.price)), [api, store])

  useEffect(() => {
    let live = true
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      store.init(list, holdings)
      const initial = Object.fromEntries(list.map(s => [s.id, s.favorite]))
      favoritesRef.current = initial
      setFavorites(initial)
      setStocks(list)
    })
    return () => { live = false }
  }, [api, store])

  // Search for the selected tab the first time it is shown (including a search restored after a reload).
  useEffect(() => {
    if (stocks && !started.current.has(selected)) startSearch(selected, tab.query)
  }, [stocks, selected, tab.query, startSearch])

  const stockById = useMemo(() => new Map((stocks ?? []).map(s => [s.id, s])), [stocks])

  const toggleFavorite = useCallback((stock: Stock) => {
    const id = stock.id
    const before = favoritesRef.current[id]
    const token = ++clickCount.current
    latestClick.current.set(id, token)
    favoritesRef.current = { ...favoritesRef.current, [id]: !before }
    setFavorites(favoritesRef.current)
    setSaveErrors(e => Object.fromEntries(Object.entries(e).filter(([k]) => k !== id)))
    api.setFavorite(id, !before).catch(() => {
      setSaveErrors(e => ({ ...e, [id]: stock.symbol }))
      // Put the star back only if this is still the latest click on it.
      if (latestClick.current.get(id) === token) {
        favoritesRef.current = { ...favoritesRef.current, [id]: before }
        setFavorites(favoritesRef.current)
      }
    })
  }, [api])

  const openDetails = useCallback((stock: Stock, button: HTMLElement) => {
    opener.current = button
    setOpenStock(stock)
    setFocusToken(t => t + 1)
  }, [])

  const closeDetails = useCallback(() => {
    setOpenStock(null)
    if (opener.current?.isConnected) opener.current.focus()
  }, [])

  if (!stocks) return <p>Loading…</p>
  const base = tab.results ? tab.results.flatMap(id => stockById.get(id) ?? []) : stocks
  const inSector = selected === 'All' ? base : base.filter(s => s.sector === (selected as Sector))
  const filtered = tab.favoritesOnly ? inSector.filter(s => favorites[s.id]) : inSector
  const visible = tab.sort === 'change' ? sortByChange(filtered, store) : filtered
  return (
    <QuoteContext.Provider value={store}>
      <div>
        <Header count={visible.length} portfolio={portfolio} />
        <nav aria-label="Sectors">
          {TABS.map(key => (
            <button key={key} type="button" aria-pressed={selected === key} onClick={() => setSelected(key)}>
              {key}
            </button>
          ))}
        </nav>
        <label htmlFor="search">Search</label>
        <input
          id="search"
          type="text"
          value={tab.query}
          onChange={e => {
            patchTab(selected, { query: e.target.value })
            startSearch(selected, e.target.value)
          }}
        />
        <label>
          <input
            type="checkbox"
            checked={tab.favoritesOnly}
            onChange={e => patchTab(selected, { favoritesOnly: e.target.checked })}
          />
          Favorites only
        </label>
        <label htmlFor="sort">Sort</label>
        <select id="sort" value={tab.sort} onChange={e => patchTab(selected, { sort: e.target.value as SortKey })}>
          <option value="symbol">Symbol</option>
          <option value="change">Change</option>
        </select>
        {tab.pending && <p role="status">Searching…</p>}
        {tab.failed && <p role="alert">Search failed</p>}
        {Object.entries(saveErrors).map(([id, symbol]) => (
          <p key={id} role="alert">{`Couldn't update ${symbol}`}</p>
        ))}
        {openStock && (
          <DetailsPanel
            key={openStock.id}
            api={api}
            stock={openStock}
            note={notesState.notes[openStock.id] ?? ''}
            canUndo={notesState.history.length > 0}
            focusToken={focusToken}
            onSave={text => dispatchNotes({ type: 'save', id: openStock.id, text })}
            onUndo={() => dispatchNotes({ type: 'undo' })}
            onClose={closeDetails}
          />
        )}
        <StockList
          stocks={visible}
          favorites={favorites}
          onToggleFavorite={toggleFavorite}
          onOpenDetails={openDetails}
        />
      </div>
    </QuoteContext.Provider>
  )
}
