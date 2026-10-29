import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Api } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { Panel } from './components/Panel'
import { NotesStore, QuoteStore } from './store'

const QUERY_KEY = 'watchlist.search'
const FAV_KEY = 'watchlist.favoritesOnly'
const SORT_KEY = 'watchlist.sort'

function read(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function write(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* ignore */ }
}

const noopSubscribe = () => () => {}
const zero = () => 0

export function App({ api }: { api: Api }) {
  const store = useMemo(() => new QuoteStore(), [api])
  const notes = useMemo(() => new NotesStore(), [api])
  const [openId, setOpenId] = useState<string | null>(null)
  const [ids, setIds] = useState<string[] | null>(null)
  const [query, setQuery] = useState(() => read(QUERY_KEY) ?? '')
  const [favoritesOnly, setFavoritesOnly] = useState(() => read(FAV_KEY) === '1')
  const [sort, setSort] = useState<'symbol' | 'change'>(() => (read(SORT_KEY) === 'change' ? 'change' : 'symbol'))
  const [matches, setMatches] = useState<Set<string> | null>(null) // null = show everything
  const [pending, setPending] = useState(() => (read(QUERY_KEY) ?? '').trim() !== '')
  const [failed, setFailed] = useState(false)
  const [favError, setFavError] = useState<string | null>(null)
  const latest = useRef<{ q: string; ctrl: AbortController } | null>(null)

  function runSearch(text: string) {
    const q = text.trim()
    if (latest.current?.q === q) return
    latest.current?.ctrl.abort()
    if (!q) {
      latest.current = null
      setMatches(null)
      setPending(false)
      setFailed(false)
      return
    }
    const ctrl = new AbortController()
    const mine = { q, ctrl }
    latest.current = mine
    setPending(true)
    api.search(q, ctrl.signal).then(
      result => {
        if (latest.current !== mine) return
        setMatches(new Set(result))
        setPending(false)
        setFailed(false)
      },
      () => {
        if (latest.current !== mine) return
        setPending(false)
        setFailed(true)
      },
    )
  }

  useEffect(() => {
    let live = true
    const unsubscribe = api.subscribeQuotes(q => store.push(q))
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      store.load(list, holdings)
      setIds(list.map(s => s.id))
    })
    runSearch(read(QUERY_KEY) ?? '') // restored search runs again
    return () => { live = false; unsubscribe(); latest.current?.ctrl.abort(); latest.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [api, store])

  // Only follow favorite changes while the filter needs them.
  const favVersion = useSyncExternalStore(favoritesOnly ? store.subscribeFavorites : noopSubscribe, favoritesOnly ? store.getFavVersion : zero)

  // Only follow quotes while the sort order depends on them.
  const quoteVersion = useSyncExternalStore(sort === 'change' ? store.subscribeAnyQuote : noopSubscribe, sort === 'change' ? store.getQuoteVersion : zero)

  const prevShown = useRef<string[] | null>(null)
  const shown = useMemo(() => {
    if (!ids) return null
    let out = ids.filter(id => (!matches || matches.has(id)) && (!favoritesOnly || store.getRow(id).favorite))
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
  }, [ids, matches, favoritesOnly, favVersion, sort, quoteVersion, store])

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
      <label>
        Search
        <input type="search" value={query} onChange={e => { setQuery(e.target.value); write(QUERY_KEY, e.target.value); runSearch(e.target.value) }} />
      </label>
      <label>
        <input type="checkbox" checked={favoritesOnly} onChange={e => { setFavoritesOnly(e.target.checked); write(FAV_KEY, e.target.checked ? '1' : '0') }} />
        Favorites only
      </label>
      <label>
        Sort
        <select value={sort} onChange={e => { const v = e.target.value === 'change' ? 'change' : 'symbol'; setSort(v); write(SORT_KEY, v) }}>
          <option value="symbol">Symbol</option>
          <option value="change">Change</option>
        </select>
      </label>
      {pending && <p role="status">Searching…</p>}
      {failed && <p role="alert">Search failed</p>}
      {favError && <p role="alert">Couldn't update {favError}</p>}
      <StockList ids={shown} store={store} onToggle={onToggle} onOpen={onOpen} />
      {openId && <Panel key={openId} id={openId} api={api} store={store} notes={notes} onClose={onClose} />}
    </div>
  )
}
