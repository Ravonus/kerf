import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Api, Stock } from './api'
import { Header } from './components/Header'
import { DetailsPanel } from './components/DetailsPanel'
import { StockList } from './components/StockList'
import { createQuoteStore, type QuoteStore } from './store'

function load(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

type Sort = 'symbol' | 'change'
const noopSubscribe = () => () => {}

function LiveHeader({ count, store }: { count: number; store: QuoteStore }) {
  const portfolio = useSyncExternalStore(store.subscribePortfolio, store.getPortfolio)
  return <Header count={count} portfolio={portfolio} />
}

export function App({ api }: { api: Api }) {
  const [stocks, setStocks] = useState<Stock[] | null>(null)
  const store = useMemo(() => createQuoteStore(), [api])
  const [query, setQuery] = useState(() => load('watchlist.search') ?? '')
  const [favoritesOnly, setFavoritesOnly] = useState(() => load('watchlist.favoritesOnly') === 'true')
  const [sort, setSort] = useState<Sort>(() => (load('watchlist.sort') === 'change' ? 'change' : 'symbol'))
  useEffect(() => save('watchlist.sort', sort), [sort])
  const version = useSyncExternalStore(sort === 'change' ? store.subscribeAny : noopSubscribe, store.getVersion)
  const orderKey = sort === 'change' ? version : 0
  const [favs, setFavs] = useState<Record<string, boolean>>({})
  const [favErrors, setFavErrors] = useState<Record<string, string>>({})
  const favRef = useRef<Record<string, boolean>>({})
  const clicks = useRef<Record<string, number>>({})
  const stocksRef = useRef<Stock[] | null>(null)
  stocksRef.current = stocks
  useEffect(() => save('watchlist.search', query), [query])
  useEffect(() => save('watchlist.favoritesOnly', String(favoritesOnly)), [favoritesOnly])

  const [openId, setOpenId] = useState<string | null>(null)
  const [notesState, setNotesState] = useState<{ notes: Record<string, string>; undo: { id: string; prev: string }[] }>({ notes: {}, undo: [] })
  const saveNote = useCallback((id: string, text: string) => {
    setNotesState(s => ({ notes: { ...s.notes, [id]: text }, undo: [...s.undo, { id, prev: s.notes[id] ?? '' }] }))
  }, [])
  const undoNote = useCallback(() => {
    setNotesState(s => {
      const last = s.undo[s.undo.length - 1]
      if (!last) return s
      return { notes: { ...s.notes, [last.id]: last.prev }, undo: s.undo.slice(0, -1) }
    })
  }, [])
  const closeDetails = useCallback(() => {
    setOpenId(id => {
      if (id) {
        const btn = Array.from(document.querySelectorAll<HTMLElement>('button[data-details-for]')).find(b => b.dataset.detailsFor === id)
        btn?.focus()
      }
      return null
    })
  }, [])

  const toggleFavorite = useCallback((id: string) => {
    const stock = stocksRef.current?.find(s => s.id === id)
    if (!stock) return
    const before = favRef.current[id] ?? stock.favorite
    const next = !before
    const token = (clicks.current[id] = (clicks.current[id] ?? 0) + 1)
    favRef.current = { ...favRef.current, [id]: next }
    setFavs(favRef.current)
    setFavErrors(e => { if (!(id in e)) return e; const { [id]: _, ...rest } = e; return rest })
    api.setFavorite(id, next).catch(() => {
      if (clicks.current[id] === token) {
        favRef.current = { ...favRef.current, [id]: before }
        setFavs(favRef.current)
      }
      setFavErrors(e => ({ ...e, [id]: `Couldn't update ${stock.symbol}` }))
    })
  }, [api])
  const [matches, setMatches] = useState<Set<string> | null>(null)
  const [searching, setSearching] = useState(false)
  const [failed, setFailed] = useState(false)
  const term = query.trim()

  useEffect(() => {
    if (!term) {
      setMatches(null)
      setSearching(false)
      setFailed(false)
      return
    }
    const ctrl = new AbortController()
    setSearching(true)
    api.search(term, ctrl.signal).then(
      ids => { if (ctrl.signal.aborted) return; setMatches(new Set(ids)); setFailed(false); setSearching(false) },
      () => { if (ctrl.signal.aborted) return; setFailed(true); setSearching(false) },
    )
    return () => ctrl.abort()
  }, [api, term])

  const filtered = useMemo(
    () => stocks && (matches || favoritesOnly)
      ? stocks.filter(s => (!matches || matches.has(s.id)) && (!favoritesOnly || (favs[s.id] ?? s.favorite)))
      : stocks,
    [stocks, matches, favoritesOnly, favs],
  )
  const shown = useMemo(() => {
    if (!filtered || sort !== 'change') return filtered
    const keyed = filtered.map((s, i) => ({ s, i, c: ((store.getPrice(s.id) ?? s.price) - s.prevClose) / s.prevClose }))
    keyed.sort((a, b) => b.c - a.c || a.i - b.i)
    return keyed.map(k => k.s)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, sort, orderKey, store])

  useEffect(() => {
    let live = true
    const unsubscribe = api.subscribeQuotes(q => { if (live) store.quote(q) })
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      store.init(list, holdings)
      setStocks(list)
    })
    return () => { live = false; unsubscribe() }
  }, [api, store])

  if (!stocks) return <p>Loading…</p>
  return (
    <div>
      <LiveHeader count={shown!.length} store={store} />
      <label>
        Search
        <input type="text" value={query} onChange={e => setQuery(e.target.value)} />
      </label>
      <label>
        Sort
        <select value={sort} onChange={e => setSort(e.target.value as Sort)}>
          <option value="symbol">Symbol</option>
          <option value="change">Change</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={favoritesOnly} onChange={e => setFavoritesOnly(e.target.checked)} />
        Favorites only
      </label>
      {searching && <p role="status">Searching…</p>}
      {failed && <p role="alert">Search failed</p>}
      {Object.entries(favErrors).map(([id, msg]) => <p key={id} role="alert">{msg}</p>)}
      {openId && stocks.find(x => x.id === openId) && (
        <DetailsPanel
          key={openId}
          api={api}
          stock={stocks.find(x => x.id === openId)!}
          store={store}
          note={notesState.notes[openId] ?? ''}
          canUndo={notesState.undo.length > 0}
          onSave={saveNote}
          onUndo={undoNote}
          onClose={closeDetails}
        />
      )}
      <StockList stocks={shown!} store={store} favs={favs} onToggle={toggleFavorite} onOpen={setOpenId} />
    </div>
  )
}
