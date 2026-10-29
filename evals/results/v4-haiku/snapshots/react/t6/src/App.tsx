import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Api, Quote } from './api'
import { DetailsPanel } from './components/DetailsPanel'
import { Header } from './components/Header'
import { Search } from './components/Search'
import { StockList } from './components/StockList'
import { NotesStore } from './notes'
import { QuoteStore, useFavoriteSet, useQuoteVersion } from './quotes'
import { TabSearches } from './searches'
import { loadView, saveView, TABS, type SortKey, type Tab, type TabSettings, type View } from './view'

export function App({ api }: { api: Api }) {
  const [store, setStore] = useState<QuoteStore | null>(null)
  const [notes] = useState(() => new NotesStore())
  const searches = useMemo(() => new TabSearches(api), [api])
  const [view, setView] = useState<View>(loadView)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const opener = useRef<HTMLElement | null>(null)

  const tab = view.tab
  const settings = view.tabs[tab]
  const tabSearch = useSyncExternalStore(searches.subscribe, () => searches.get(tab))
  const favorites = useFavoriteSet(store)
  const favoriteFilter = settings.favoritesOnly ? favorites : null
  const byChange = settings.sort === 'change'
  // Only the change sort needs to hear about every quote; the symbol order never changes.
  const version = useQuoteVersion(store, byChange)

  const onSaveError = useCallback((message: string | null) => setSaveError(message), [])
  const openDetails = useCallback((id: string, el: HTMLElement) => {
    opener.current = el
    setOpenId(id)
  }, [])
  const closeDetails = useCallback(() => {
    setOpenId(null)
    opener.current?.focus()
  }, [])
  const patchTab = useCallback(
    (patch: Partial<TabSettings>) =>
      setView(v => ({ ...v, tabs: { ...v.tabs, [v.tab]: { ...v.tabs[v.tab], ...patch } } })),
    [],
  )
  const selectTab = useCallback((t: Tab) => setView(v => ({ ...v, tab: t })), [])

  useEffect(() => saveView(view), [view])

  // A restored search is sent when its tab is first shown.
  useEffect(() => {
    searches.ensureStarted(tab, view.tabs[tab].search)
  }, [searches, tab])

  useEffect(() => {
    let live = true
    let current: QuoteStore | null = null
    const early: Quote[] = []
    // One subscription for the whole app; quotes that arrive before the list loads are applied once it has.
    const unsubscribe = api.subscribeQuotes(q => (current ? current.apply(q) : early.push(q)))
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      current = new QuoteStore(list, holdings)
      early.forEach(current.apply)
      setStore(current)
    })
    return () => {
      live = false
      unsubscribe()
    }
  }, [api])

  const sector = tab === 'All' ? null : tab
  const matches = tabSearch.results
  const visible = useMemo(() => {
    if (!store) return []
    let list = store.stocks
    if (sector || matches || favoriteFilter) {
      list = list.filter(
        s => (!sector || s.sector === sector) && (!matches || matches.has(s.id)) && (!favoriteFilter || favoriteFilter.has(s.id)),
      )
    }
    // Copy before sorting; the sort is stable, so ties keep list order.
    if (byChange) list = [...list].sort((a, b) => store.changeOf(b.id) - store.changeOf(a.id))
    return list
  }, [store, sector, matches, favoriteFilter, byChange, byChange ? version : 0])

  if (!store) return <p>Loading…</p>
  return (
    <div>
      <Header count={visible.length} store={store} />
      <div>
        {TABS.map(t => (
          <button key={t} type="button" aria-pressed={t === tab} onClick={() => selectTab(t)}>
            {t}
          </button>
        ))}
      </div>
      {saveError && <p role="alert">{saveError}</p>}
      <Search
        text={settings.search}
        onText={text => {
          patchTab({ search: text })
          searches.setText(tab, text)
        }}
        pending={tabSearch.pending}
        failed={tabSearch.failed}
      />
      <label>
        <input
          type="checkbox"
          checked={settings.favoritesOnly}
          onChange={e => patchTab({ favoritesOnly: e.target.checked })}
        />{' '}
        Favorites only
      </label>
      <label>
        Sort{' '}
        <select value={settings.sort} onChange={e => patchTab({ sort: e.target.value as SortKey })}>
          <option value="symbol">Symbol</option>
          <option value="change">Change</option>
        </select>
      </label>
      {openId !== null && (
        <DetailsPanel key={openId} id={openId} store={store} api={api} notes={notes} onClose={closeDetails} />
      )}
      <StockList stocks={visible} store={store} api={api} onSaveError={onSaveError} onOpen={openDetails} />
    </div>
  )
}
