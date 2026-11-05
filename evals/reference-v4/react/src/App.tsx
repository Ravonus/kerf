import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type SetStateAction,
} from 'react'
import type { Api, Holding, Sector, Stock } from './api'
import { DetailsPanel } from './components/DetailsPanel'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { TabSearch, type SearchState } from './components/TabSearch'
import { Toolbar } from './components/Toolbar'

export type Live = { price: number; history: number[] }
export type Tab = 'All' | Sector
export type View = { query: string; favoritesOnly: boolean; sort: 'symbol' | 'change' }
type Saved = { tab: Tab; views: Record<Tab, View> }
type Save = { id: string; prev: string }

export const TABS: Tab[] = ['All', 'tech', 'energy', 'health', 'finance']
const VIEW_KEY = 'watchlist:view'
const blank: View = { query: '', favoritesOnly: false, sort: 'symbol' }
function loadSaved(): Saved {
  const views = Object.fromEntries(TABS.map((t) => [t, blank])) as Record<Tab, View>
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}')
    for (const t of TABS) views[t] = { ...blank, ...saved.views?.[t] }
    return { tab: TABS.includes(saved.tab) ? saved.tab : 'All', views }
  } catch {
    return { tab: 'All', views }
  }
}

const changeOf = (s: Stock, live: Record<string, Live>) =>
  (live[s.id].price - s.prevClose) / s.prevClose

export function App({ api }: { api: Api }) {
  const [stocks, setStocks] = useState<Stock[] | null>(null)
  const [holdings, setHoldings] = useState<Holding[]>([])
  const [live, setLive] = useState<Record<string, Live>>({})
  const [saved, setSaved] = useState(loadSaved)
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set([saved.tab]))
  const [searches, setSearches] = useState<Partial<Record<Tab, SearchState>>>({})
  const [favorites, setFavorites] = useState<Record<string, boolean>>({})
  const [alert, setAlert] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [saves, setSaves] = useState<Save[]>([])

  useData(api, setStocks, setHoldings, setLive, setFavorites)

  useEffect(() => {
    localStorage.setItem(VIEW_KEY, JSON.stringify(saved))
  }, [saved])

  const { tab, view, setView, selectTab, onSearch, search } = useViews(
    saved,
    setSaved,
    setVisited,
    searches,
    setSearches,
  )

  const toggle = useFavorites(api, favorites, setFavorites, setAlert)

  const openDetails = useDetails(openId, setOpenId)

  const { save, undo } = useNotes(saves, setSaves, setNotes)

  const { shown, portfolio } = useResults(stocks, holdings, live, tab, view, search, favorites)

  if (!stocks) return <p>Loading…</p>
  const open = openId ? stocks.find((s) => s.id === openId) : undefined
  return (
    <div>
      {TABS.filter((t) => visited.has(t)).map((t) => (
        <TabSearch key={t} api={api} tab={t} query={saved.views[t].query} onState={onSearch} />
      ))}
      <Header count={shown.length} portfolio={portfolio} />
      <nav>
        {TABS.map((t) => (
          <button key={t} aria-pressed={t === tab} onClick={() => selectTab(t)}>
            {t}
          </button>
        ))}
      </nav>
      <Toolbar view={view} onView={setView} />
      <p role="status">{search?.state === 'pending' ? 'Searching…' : ''}</p>
      {search?.state === 'failed' && <p role="alert">Search failed</p>}
      {alert && <p role="alert">{alert}</p>}
      <StockList
        stocks={shown}
        live={live}
        favorites={favorites}
        onToggle={toggle}
        onDetails={openDetails}
      />
      {open && (
        <DetailsPanel
          key={open.id}
          api={api}
          stock={open}
          price={live[open.id].price}
          note={notes[open.id] ?? ''}
          canUndo={saves.length > 0}
          onSave={save}
          onUndo={undo}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

type Setter<T> = Dispatch<SetStateAction<T>>
function useData(
  api: Api,
  setStocks: Setter<Stock[] | null>,
  setHoldings: Setter<Holding[]>,
  setLive: Setter<Record<string, Live>>,
  setFavorites: Setter<Record<string, boolean>>,
) {
  useEffect(() => {
    let alive = true
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, held]) => {
      if (!alive) return
      setStocks(list)
      setHoldings(held)
      setLive(Object.fromEntries(list.map((s) => [s.id, { price: s.price, history: [s.price] }])))
      setFavorites(Object.fromEntries(list.map((s) => [s.id, s.favorite])))
    })
    return () => {
      alive = false
    }
  }, [api])

  // React batches the updates of a synchronous burst into one render.
  useEffect(
    () =>
      api.subscribeQuotes(({ id, price }) =>
        setLive((all) =>
          all[id]
            ? { ...all, [id]: { price, history: [...all[id].history, price].slice(-20) } }
            : all,
        ),
      ),
    [api],
  )
}
function useFavorites(
  api: Api,
  favorites: Record<string, boolean>,
  setFavorites: Setter<Record<string, boolean>>,
  setAlert: Setter<string | null>,
) {
  const favRef = useRef(favorites)
  favRef.current = favorites
  const clicks = useRef<Record<string, number>>({})
  const toggle = useCallback(
    (stock: Stock) => {
      const before = favRef.current[stock.id]
      const click = (clicks.current[stock.id] ?? 0) + 1
      clicks.current[stock.id] = click
      favRef.current = { ...favRef.current, [stock.id]: !before }
      setFavorites((f) => ({ ...f, [stock.id]: !before }))
      api.setFavorite(stock.id, !before).catch(() => {
        if (clicks.current[stock.id] === click) setFavorites((f) => ({ ...f, [stock.id]: before }))
        setAlert(`Couldn't update ${stock.symbol}`)
      })
    },
    [api],
  )

  return toggle
}
function useDetails(openId: string | null, setOpenId: Setter<string | null>) {
  const opener = useRef<HTMLElement | null>(null)
  const openDetails = useCallback((id: string, button: HTMLElement) => {
    opener.current = button
    setOpenId(id)
  }, [])
  useEffect(() => {
    if (openId === null && opener.current) {
      opener.current.focus()
      opener.current = null
    }
  }, [openId])

  return openDetails
}
function useNotes(
  saves: Save[],
  setSaves: Setter<Save[]>,
  setNotes: Setter<Record<string, string>>,
) {
  const save = useCallback((id: string, text: string) => {
    setNotes((n) => {
      setSaves((s) => [...s, { id, prev: n[id] ?? '' }])
      return { ...n, [id]: text }
    })
  }, [])
  const undo = () => {
    const last = saves[saves.length - 1]
    if (!last) return
    setSaves(saves.slice(0, -1))
    setNotes((n) => ({ ...n, [last.id]: last.prev }))
  }

  return { save, undo }
}
function useResults(
  stocks: Stock[] | null,
  holdings: Holding[],
  live: Record<string, Live>,
  tab: Tab,
  view: View,
  search: SearchState | undefined,
  favorites: Record<string, boolean>,
) {
  const results = view.query.trim() ? (search?.results ?? null) : null
  const filtered = useMemo(
    () =>
      (stocks ?? []).filter(
        (s) =>
          (tab === 'All' || s.sector === tab) &&
          (!results || results.has(s.id)) &&
          (!view.favoritesOnly || favorites[s.id]),
      ),
    [stocks, tab, results, view.favoritesOnly, favorites],
  )
  // Only the Change sort reads live prices, so quotes don't re-sort a Symbol-sorted list.
  const ordered = view.sort === 'change' ? live : null
  const shown = useMemo(
    () =>
      ordered
        ? [...filtered].sort((a, b) => changeOf(b, ordered) - changeOf(a, ordered))
        : filtered,
    [filtered, ordered],
  )
  const portfolio = useMemo(
    () => holdings.reduce((sum, h) => sum + h.qty * (live[h.id]?.price ?? 0), 0),
    [holdings, live],
  )

  return { shown, portfolio }
}

function useViews(
  saved: Saved,
  setSaved: Setter<Saved>,
  setVisited: Setter<Set<Tab>>,
  searches: Partial<Record<Tab, SearchState>>,
  setSearches: Setter<Partial<Record<Tab, SearchState>>>,
) {
  const tab = saved.tab
  const view = saved.views[tab]
  const setView = useCallback(
    (patch: Partial<View>) =>
      setSaved((s) => ({ ...s, views: { ...s.views, [s.tab]: { ...s.views[s.tab], ...patch } } })),
    [],
  )
  const selectTab = (t: Tab) => {
    setSaved((s) => ({ ...s, tab: t }))
    setVisited((v) => (v.has(t) ? v : new Set([...v, t])))
  }
  const onSearch = useCallback(
    (t: Tab, state: SearchState) => setSearches((s) => ({ ...s, [t]: state })),
    [],
  )
  const search = searches[tab]

  return { tab, view, setView, selectTab, onSearch, search }
}
