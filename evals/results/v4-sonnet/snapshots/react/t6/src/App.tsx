import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Api } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { Panel } from './components/Panel'
import { NotesStore, QuoteStore } from './store'

const STORAGE_KEY = 'watchlist.tabs'
const TABS = ['All', 'tech', 'energy', 'health', 'finance'] as const
type Tab = (typeof TABS)[number]
type Sort = 'symbol' | 'change'
type TabState = { query: string; favoritesOnly: boolean; sort: Sort; matches: Set<string> | null; pending: boolean; failed: boolean }

function load(): { selected: Tab; tabs: Record<Tab, TabState> } {
  let saved: any = null
  try { saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') } catch { /* ignore */ }
  const tabs = {} as Record<Tab, TabState>
  for (const t of TABS) {
    const o = saved?.tabs?.[t]
    tabs[t] = {
      query: typeof o?.query === 'string' ? o.query : '',
      favoritesOnly: o?.favoritesOnly === true,
      sort: o?.sort === 'change' ? 'change' : 'symbol',
      matches: null,
      pending: false,
      failed: false,
    }
  }
  const selected: Tab = TABS.includes(saved?.selected) ? saved.selected : 'All'
  tabs[selected].pending = tabs[selected].query.trim() !== ''
  return { selected, tabs }
}

const noopSubscribe = () => () => {}
const zero = () => 0

export function App({ api }: { api: Api }) {
  const store = useMemo(() => new QuoteStore(), [api])
  const notes = useMemo(() => new NotesStore(), [api])
  const [openId, setOpenId] = useState<string | null>(null)
  const [ids, setIds] = useState<string[] | null>(null)
  const [init] = useState(load)
  const [selected, setSelected] = useState<Tab>(init.selected)
  const [tabs, setTabs] = useState(init.tabs)
  const [favError, setFavError] = useState<string | null>(null)
  const latest = useRef<Partial<Record<Tab, { q: string; ctrl: AbortController }>>>({})
  const started = useRef(new Set<Tab>())

  const cur = tabs[selected]
  const { favoritesOnly, sort, matches } = cur

  const update = useCallback((tab: Tab, patch: Partial<TabState>) => {
    setTabs(prev => ({ ...prev, [tab]: { ...prev[tab], ...patch } }))
  }, [])

  function runSearch(tab: Tab, text: string) {
    const q = text.trim()
    const prev = latest.current[tab]
    if (prev?.q === q) return
    prev?.ctrl.abort()
    if (!q) {
      delete latest.current[tab]
      update(tab, { matches: null, pending: false, failed: false })
      return
    }
    const ctrl = new AbortController()
    const mine = { q, ctrl }
    latest.current[tab] = mine
    update(tab, { pending: true })
    api.search(q, ctrl.signal).then(
      result => {
        if (latest.current[tab] !== mine) return
        update(tab, { matches: new Set(result), pending: false, failed: false })
      },
      () => {
        if (latest.current[tab] !== mine) return
        update(tab, { pending: false, failed: true })
      },
    )
  }

  function ensureStarted(tab: Tab) {
    if (started.current.has(tab)) return
    started.current.add(tab)
    runSearch(tab, tabs[tab].query)
  }

  useEffect(() => {
    let live = true
    const unsubscribe = api.subscribeQuotes(q => store.push(q))
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      store.load(list, holdings)
      setIds(list.map(s => s.id))
    })
    ensureStarted(selected) // the restored search of the shown tab runs again
    return () => {
      live = false
      unsubscribe()
      for (const t of TABS) latest.current[t]?.ctrl.abort()
      latest.current = {}
      started.current.clear()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, store])

  useEffect(() => {
    try {
      const saved = Object.fromEntries(TABS.map(t => [t, { query: tabs[t].query, favoritesOnly: tabs[t].favoritesOnly, sort: tabs[t].sort }]))
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ selected, tabs: saved }))
    } catch { /* ignore */ }
  }, [tabs, selected])

  // Only follow favorite changes while the filter needs them.
  const favVersion = useSyncExternalStore(favoritesOnly ? store.subscribeFavorites : noopSubscribe, favoritesOnly ? store.getFavVersion : zero)

  // Only follow quotes while the sort order depends on them.
  const quoteVersion = useSyncExternalStore(sort === 'change' ? store.subscribeAnyQuote : noopSubscribe, sort === 'change' ? store.getQuoteVersion : zero)

  const prevShown = useRef<string[] | null>(null)
  const shown = useMemo(() => {
    if (!ids) return null
    let out = ids.filter(id => (selected === 'All' || store.getRow(id).stock.sector === selected) && (!matches || matches.has(id)) && (!favoritesOnly || store.getRow(id).favorite))
    if (sort === 'change') {
      const pos = new Map(ids.map((id, i) => [id, i]))
      out = out
        .map(id => [id, store.change(id)] as const)
        .sort((a, b) => b[1] - a[1] || pos.get(a[0])! - pos.get(b[0])!)
        .map(e => e[0])
    }
    const prev = prevShown.current
    if (prev && prev.length === out.length && prev.every((id, i) => id === out[i])) return prev
    prevShown.current = out
    return out
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ids, matches, favoritesOnly, favVersion, sort, quoteVersion, store, selected])

  const onToggle = useCallback((id: string) => {
    const prev = store.getRow(id).favorite
    const next = !prev
    const symbol = store.getRow(id).stock.symbol
    const n = store.bumpClick(id)
    store.setFavorite(id, next)
    api.setFavorite(id, next).then(
      () => setFavError(cur => (cur === symbol ? null : cur)),
      () => {
        if (store.clickCount(id) === n) store.setFavorite(id, prev)
        setFavError(symbol)
      },
    )
  }, [api, store])

  const onOpen = useCallback((id: string) => setOpenId(id), [])
  const onClose = useCallback(() => setOpenId(null), [])

  if (!shown) return <p>Loading…</p>
  return (
    <div>
      <Header count={shown.length} store={store} />
      <div>
        {TABS.map(t => (
          <button key={t} type="button" aria-pressed={t === selected} onClick={() => { setSelected(t); ensureStarted(t) }}>{t}</button>
        ))}
      </div>
      <label>
        Search
        <input type="search" value={cur.query} onChange={e => { update(selected, { query: e.target.value }); runSearch(selected, e.target.value) }} />
      </label>
      <label>
        <input type="checkbox" checked={favoritesOnly} onChange={e => update(selected, { favoritesOnly: e.target.checked })} />
        Favorites only
      </label>
      <label>
        Sort
        <select value={sort} onChange={e => update(selected, { sort: e.target.value === 'change' ? 'change' : 'symbol' })}>
          <option value="symbol">Symbol</option>
          <option value="change">Change</option>
        </select>
      </label>
      {cur.pending && <p role="status">Searching…</p>}
      {cur.failed && <p role="alert">Search failed</p>}
      {favError && <p role="alert">Couldn't update {favError}</p>}
      <StockList ids={shown} store={store} onToggle={onToggle} onOpen={onOpen} />
      {openId && <Panel key={openId} id={openId} api={api} store={store} notes={notes} onClose={onClose} />}
    </div>
  )
}
