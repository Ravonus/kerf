import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore } from 'react'
import type { Api, Stock } from './api'
import { Header } from './components/Header'
import { DetailsPanel } from './components/DetailsPanel'
import { StockList } from './components/StockList'
import { QuoteContext, QuoteStore } from './quotes'

const QUERY_KEY = 'watchlist.query'
const FAVORITES_ONLY_KEY = 'watchlist.favoritesOnly'

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
function readStored(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* not persisted */ }
}

export function App({ api }: { api: Api }) {
  const [store] = useState(() => new QuoteStore())
  const [stocks, setStocks] = useState<Stock[] | null>(null)
  const portfolio = useSyncExternalStore(store.subscribePortfolio, store.getPortfolio)

  const [query, setQuery] = useState(() => readStored(QUERY_KEY) ?? '')
  const [favoritesOnly, setFavoritesOnly] = useState(() => readStored(FAVORITES_ONLY_KEY) === 'true')
  // null means "show every stock"; otherwise the results of the latest successful search.
  const [shown, setShown] = useState<Stock[] | null>(null)
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const trimmed = query.trim()

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

  useEffect(() => writeStored(QUERY_KEY, query), [query])
  useEffect(() => writeStored(FAVORITES_ONLY_KEY, String(favoritesOnly)), [favoritesOnly])

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

  // Each query aborts the one before it. Only the latest, unaborted request may update the state.
  useEffect(() => {
    if (!stocks || !trimmed) {
      setShown(null)
      setPending(false)
      setFailed(false)
      return
    }
    const controller = new AbortController()
    const byId = new Map(stocks.map(s => [s.id, s]))
    setPending(true)
    api.search(trimmed, controller.signal).then(
      ids => {
        if (controller.signal.aborted) return
        setShown(ids.flatMap(id => byId.get(id) ?? []))
        setFailed(false)
        setPending(false)
      },
      () => {
        if (controller.signal.aborted) return
        setFailed(true)
        setPending(false)
      },
    )
    return () => controller.abort()
  }, [api, stocks, trimmed])

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
  const searched = shown ?? stocks
  const visible = favoritesOnly ? searched.filter(s => favorites[s.id]) : searched
  return (
    <QuoteContext.Provider value={store}>
      <div>
        <Header count={visible.length} portfolio={portfolio} />
        <label htmlFor="search">Search</label>
        <input id="search" type="text" value={query} onChange={e => setQuery(e.target.value)} />
        <label>
          <input type="checkbox" checked={favoritesOnly} onChange={e => setFavoritesOnly(e.target.checked)} />
          Favorites only
        </label>
        {pending && <p role="status">Searching…</p>}
        {failed && <p role="alert">Search failed</p>}
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
