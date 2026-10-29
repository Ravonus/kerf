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
const TABS = ['All', 'tech', 'energy', 'health', 'finance'] as const
type Tab = (typeof TABS)[number]
type TabSettings = { query: string; favoritesOnly: boolean; sort: Sort }
type SearchState = { matches: Set<string> | null; searching: boolean; failed: boolean }
const IDLE: SearchState = { matches: null, searching: false, failed: false }
const tabKey = (base: string, t: Tab) => (t === 'All' ? base : `${base}.${t}`)
const noopSubscribe = () => () => {}

function LiveHeader({ count, store }: { count: number; store: QuoteStore }) {
  const portfolio = useSyncExternalStore(store.subscribePortfolio, store.getPortfolio)
  return <Header count={count} portfolio={portfolio} />
}

export function App({ api }: { api: Api }) {
  const [stocks, setStocks] = useState<Stock[] | null>(null)
  const store = useMemo(() => createQuoteStore(), [api])
  const [tab, setTab] = useState<Tab>(() => {
    const t = load('watchlist.tab')
    return (TABS as readonly string[]).includes(t ?? '') ? (t as Tab) : 'All'
  })
  const [settings, setSettings] = useState<Record<Tab, TabSettings>>(() => {
    const out = {} as Record<Tab, TabSettings>
    for (const t of TABS) {
      out[t] = {
        query: load(tabKey('watchlist.search', t)) ?? '',
        favoritesOnly: load(tabKey('watchlist.favoritesOnly', t)) === 'true',
        sort: load(tabKey('watchlist.sort', t)) === 'change' ? 'change' : 'symbol',
      }
    }
    return out
  })
  useEffect(() => {
    for (const t of TABS) {
      save(tabKey('watchlist.search', t), settings[t].query)
      save(tabKey('watchlist.favoritesOnly', t), String(settings[t].favoritesOnly))
      save(tabKey('watchlist.sort', t), settings[t].sort)
    }
  }, [settings])
  useEffect(() => save('watchlist.tab', tab), [tab])
  const { query, favoritesOnly, sort } = settings[tab]
  const patchSettings = (patch: Partial<TabSettings>) => setSettings(st => ({ ...st, [tab]: { ...st[tab], ...patch } }))
  const version = useSyncExternalStore(sort === 'change' ? store.subscribeAny : noopSubscribe, store.getVersion)
  const orderKey = sort === 'change' ? version : 0
  const [favs, setFavs] = useState<Record<string, boolean>>({})
  const [favErrors, setFavErrors] = useState<Record<string, string>>({})
  const favRef = useRef<Record<string, boolean>>({})
  const clicks = useRef<Record<string, number>>({})
  const stocksRef = useRef<Stock[] | null>(null)
  stocksRef.current = stocks

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
  const [searches, setSearches] = useState<Record<Tab, SearchState>>(() => Object.fromEntries(TABS.map(t => [t, IDLE])) as Record<Tab, SearchState>)
  const ctrls = useRef<Partial<Record<Tab, AbortController>>>({})
  const requested = useRef<Partial<Record<Tab, string>>>({})
  const patchSearch = (t: Tab, patch: Partial<SearchState>) => setSearches(st => ({ ...st, [t]: { ...st[t], ...patch } }))
  const term = query.trim()

  useEffect(() => () => {
    for (const t of TABS) ctrls.current[t]?.abort()
    ctrls.current = {}
    requested.current = {}
  }, [api])

  useEffect(() => {
    const t = tab
    if (!term) {
      ctrls.current[t]?.abort()
      delete ctrls.current[t]
      requested.current[t] = ''
      setSearches(st => (st[t] === IDLE ? st : { ...st, [t]: IDLE }))
      return
    }
    if (requested.current[t] === term) return
    ctrls.current[t]?.abort()
    const ctrl = new AbortController()
    ctrls.current[t] = ctrl
    requested.current[t] = term
    patchSearch(t, { searching: true })
    api.search(term, ctrl.signal).then(
      ids => { if (!ctrl.signal.aborted) patchSearch(t, { matches: new Set(ids), failed: false, searching: false }) },
      () => { if (!ctrl.signal.aborted) patchSearch(t, { failed: true, searching: false }) },
    )
  }, [api, tab, term])
  const { matches, searching, failed } = searches[tab]

  const filtered = useMemo(
    () => stocks && (matches || favoritesOnly || tab !== 'All')
      ? stocks.filter(s => (tab === 'All' || s.sector === tab) && (!matches || matches.has(s.id)) && (!favoritesOnly || (favs[s.id] ?? s.favorite)))
      : stocks,
    [stocks, matches, favoritesOnly, favs, tab],
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
      <div>
        {TABS.map(t => (
          <button key={t} type="button" aria-pressed={t === tab} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      <label>
        Search
        <input type="text" value={query} onChange={e => patchSettings({ query: e.target.value })} />
      </label>
      <label>
        Sort
        <select value={sort} onChange={e => patchSettings({ sort: e.target.value as Sort })}>
          <option value="symbol">Symbol</option>
          <option value="change">Change</option>
        </select>
      </label>
      <label>
        <input type="checkbox" checked={favoritesOnly} onChange={e => patchSettings({ favoritesOnly: e.target.checked })} />
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
