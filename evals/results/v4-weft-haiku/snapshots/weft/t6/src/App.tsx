import { derived, onCleanup, state, watch } from 'weft'
import type { Api, Holding, Quote, Sector, Stock } from './api'
import { DetailsPanel, type Details } from './components/DetailsPanel'
import { Header } from './components/Header'
import { StockList } from './components/StockList'

/** The latest price per stock id, with the last 20 prices (oldest first) for its sparkline. */
export type Latest = { price: number; history: number[] }
export type SortBy = 'symbol' | 'change'
/** A sector tab, or `All`. */
export type Tab = 'All' | Sector

const TABS: Tab[] = ['All', 'tech', 'energy', 'health', 'finance']
const HISTORY = 20
const LOADING = { id: '', status: 'loading' as const, text: '' }
const VIEWS_KEY = 'watchlist.views'

/** What a tab shows and keeps: its search (text, results, request state), Favorites only and Sort. */
type View = { query: string; found: string[] | null; searching: boolean; failed: boolean; favOnly: boolean; sort: SortBy }

/** localStorage can be missing or throw (blocked storage, private windows): the app works without it. */
function loadSaved(): { tab?: unknown; views?: Record<string, { query?: unknown; favOnly?: unknown; sort?: unknown }> } {
  try {
    const raw = localStorage.getItem(VIEWS_KEY)
    return raw ? JSON.parse(raw) : {}
  } catch {
    return {}
  }
}
function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* not persisted */ }
}

function initialViews(saved: ReturnType<typeof loadSaved>): Record<Tab, View> {
  const out = {} as Record<Tab, View>
  for (const t of TABS) {
    const v = saved.views?.[t] ?? {}
    out[t] = {
      query: typeof v.query === 'string' ? v.query : '',
      found: null,
      searching: false,
      failed: false,
      favOnly: v.favOnly === true,
      sort: v.sort === 'change' ? 'change' : 'symbol',
    }
  }
  return out
}

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const quotes = state<Record<string, Latest>>({})
  const saved = loadSaved()
  const tab = state<Tab>(TABS.includes(saved.tab as Tab) ? (saved.tab as Tab) : 'All')
  const views = state<Record<Tab, View>>(initialViews(saved))
  /** Favorite flags the user changed in this session, by stock id (the list's flag is the default). */
  const favs = state<Record<string, boolean>>({})
  const errors = state<string[]>([])
  /** The latest click per stock: a save that is no longer the latest must not undo a newer click. */
  const clicks = new Map<string, number>()
  /** Each tab's latest search: its trimmed text and the controller that can abort it. */
  const inflight = new Map<Tab, { text: string; ctrl: AbortController }>()
  /** The open stock's id, if the details panel is open. */
  const openId = state<string | null>(null)
  const isOpen = derived(() => openId.value !== null)
  const detail = state<{ id: string; status: 'loading' | 'ok' | 'error'; text: string }>({ id: '', status: 'loading', text: '' })
  /** The loaded description, but only for the stock that is open now. */
  const view = derived(() => (detail.value.id === openId.value ? detail.value : LOADING))
  const draft = state('')
  /** Saved notes by stock id, and the saves that can be undone (newest last, with the note each save replaced). */
  const notes = state<Record<string, string>>({})
  const undos = state<{ id: string; before: string | undefined }[]>([])
  const canUndo = derived(() => undos.value.length > 0)
  /** Load counter: a description that arrives for an earlier load is dropped. */
  const detailSeq = { n: 0 }

  const byId = derived(() => new Map((stocks.value ?? []).map(s => [s.id, s])))
  const portfolio = derived(() =>
    holdings.value.reduce((sum, h) => sum + h.qty * (quotes.value[h.id]?.price ?? byId.value.get(h.id)?.price ?? 0), 0),
  )
  const current = derived(() => views.value[tab.value])
  const openStock = derived(() => (openId.value === null ? undefined : byId.value.get(openId.value)))
  const openPrice = derived(() => {
    const id = openId.value
    return id === null ? undefined : quotes.get(id)?.price ?? byId.value.get(id)?.price
  })
  const shown = derived(() => {
    const v = current.value
    const sector = tab.value
    const ids = v.found === null ? null : new Set(v.found)
    // Read the flags only while the filter is on, so a star click doesn't re-filter the list otherwise.
    const flags = v.favOnly ? favs.value : null
    const rows = (stocks.value ?? []).filter(s =>
      (sector === 'All' || s.sector === sector) && (ids === null || ids.has(s.id)) && (flags === null || (flags[s.id] ?? s.favorite)),
    )
    if (v.sort === 'symbol') return rows
    // Biggest gain first, from the latest prices. Array sort is stable, so ties keep list order.
    // Read the quotes only in this mode: in list order a quote never reorders anything.
    const live = quotes.value
    const change = (s: Stock) => {
      const price = live[s.id]?.price ?? s.price
      return (price - s.prevClose) / s.prevClose
    }
    return rows.slice().sort((a, b) => change(b) - change(a))
  })

  const patch = (t: Tab, change: Partial<View>) => {
    views.value = { ...views.value, [t]: { ...views.value[t], ...change } }
  }

  /**
   * Searches for tab `t`. A newer text in the same tab aborts the request in flight; a tab's request is never
   * aborted by switching tabs, so its results are there when the tab is shown again.
   */
  const runSearch = (t: Tab, text: string) => {
    const cur = inflight.get(t)
    if (cur && cur.text === text) return
    cur?.ctrl.abort()
    if (text === '') {
      inflight.delete(t)
      patch(t, { found: null, searching: false })
      return
    }
    const ctrl = new AbortController()
    inflight.set(t, { text, ctrl })
    patch(t, { searching: true })
    api.search(text, ctrl.signal).then(ids => {
      if (ctrl.signal.aborted) return
      patch(t, { found: ids, failed: false, searching: false })
    }, () => {
      if (ctrl.signal.aborted) return
      patch(t, { failed: true, searching: false })
    })
  }

  const setQuery = (text: string) => {
    const t = tab.value
    patch(t, { query: text })
    runSearch(t, text.trim())
  }
  // Selecting a tab shows its own results; a restored search runs the first time its tab is shown.
  const selectTab = (t: Tab) => {
    tab.value = t
    runSearch(t, views.value[t].query.trim())
  }

  watch(() => api, source => {
    let live = true
    Promise.all([source.listStocks(), source.listHoldings()]).then(([list, hs]) => {
      if (!live) return
      stocks.value = list
      holdings.value = hs
    })
    // The selected tab's restored search runs now (reading the boxes here is untracked).
    runSearch(tab.value, views.value[tab.value].query.trim())
    return () => { live = false }
  })

  // One subscription for the app's lifetime. Quotes are applied once the list has loaded (they need its base price).
  watch(() => api, source => source.subscribeQuotes((q: Quote) => {
    const base = byId.value.get(q.id)
    if (!base) return
    const prev = quotes.value[q.id] ?? { price: base.price, history: [base.price] }
    quotes.value = { ...quotes.value, [q.id]: { price: q.price, history: [...prev.history, q.price].slice(-HISTORY) } }
  }))

  onCleanup(() => {
    for (const { ctrl } of inflight.values()) ctrl.abort()
  })

  const loadDetails = (id: string) => {
    const seq = ++detailSeq.n
    detail.value = { id, status: 'loading', text: '' }
    const stillWanted = () => seq === detailSeq.n && openId.value === id
    api.details(id).then(d => {
      if (stillWanted()) detail.value = { id, status: 'ok', text: d.description }
    }, () => {
      if (stillWanted()) detail.value = { id, status: 'error', text: '' }
    })
  }

  watch(() => openId.value, id => {
    if (id === null) return
    draft.value = notes.value[id] ?? ''
    loadDetails(id)
  })

  const openDetails = (id: string) => { openId.value = id }
  const close = () => {
    const id = openId.value
    openId.value = null
    if (id !== null) document.getElementById(`details-${id}`)?.focus()
  }
  const save = () => {
    const id = openId.value
    if (id === null) return
    undos.value = [...undos.value, { id, before: notes.value[id] }]
    notes.value = { ...notes.value, [id]: draft.value }
  }
  const undo = () => {
    const top = undos.value.at(-1)
    if (!top) return
    undos.value = undos.value.slice(0, -1)
    const next = { ...notes.value }
    if (top.before === undefined) delete next[top.id]
    else next[top.id] = top.before
    notes.value = next
    if (openId.value === top.id) draft.value = top.before ?? ''
  }
  const retry = () => { if (openId.value !== null) loadDetails(openId.value) }
  const details: Details = { stock: openStock, price: openPrice, view, draft, canUndo, save, undo, retry, close }

  // Everything the user chose that survives a reload: the selected tab, and each tab's search, Favorites only, Sort.
  const persisted = derived(() => JSON.stringify({
    tab: tab.value,
    views: Object.fromEntries(TABS.map(t => [t, { query: views.value[t].query, favOnly: views.value[t].favOnly, sort: views.value[t].sort }])),
  }))
  watch(() => persisted.value, json => writeStored(VIEWS_KEY, json))

  // The star shows the new flag at once. If the save fails, it goes back to what it was before this click, unless
  // the user has clicked this star again since (that click's own save decides).
  const toggleFavorite = (id: string) => {
    const stock = byId.value.get(id)
    if (!stock) return
    const before = favs.value[id] ?? stock.favorite
    const seq = (clicks.get(id) ?? 0) + 1
    clicks.set(id, seq)
    favs.value = { ...favs.value, [id]: !before }
    const message = `Couldn't update ${stock.symbol}`
    api.setFavorite(id, !before).then(() => {
      errors.value = errors.value.filter(m => m !== message)
    }, () => {
      if (!errors.value.includes(message)) errors.value = [...errors.value, message]
      if (clicks.get(id) === seq) favs.value = { ...favs.value, [id]: before }
    })
  }

  return (
    <div>
      <div>
        {TABS.map(t => (
          <button key={t} type="button" aria-pressed={tab.value === t ? 'true' : 'false'} onClick={() => selectTab(t)}>{t}</button>
        ))}
      </div>
      <label>
        Search <input value={current.value.query} onInput={e => setQuery(e.currentTarget.value)} />
      </label>
      <label>
        <input type="checkbox" checked={current.value.favOnly} onChange={e => patch(tab.value, { favOnly: e.currentTarget.checked })} /> Favorites only
      </label>
      <label>
        Sort{' '}
        <select value={current.value.sort} onChange={e => patch(tab.value, { sort: e.currentTarget.value === 'change' ? 'change' : 'symbol' })}>
          <option value="symbol">Symbol</option>
          <option value="change">Change</option>
        </select>
      </label>
      {current.value.searching && <p role="status">Searching…</p>}
      {current.value.failed && <p role="alert">Search failed</p>}
      {errors.value.map(m => <p key={m} role="alert">{m}</p>)}
      {!stocks.value ? (
        <p>Loading…</p>
      ) : (
        <div>
          <Header count={shown.value.length} portfolio={portfolio.value} />
          <StockList stocks={shown.value} quotes={quotes} favs={favs} onToggle={toggleFavorite} onOpen={openDetails} />
        </div>
      )}
      {isOpen.value && <DetailsPanel d={details} />}
    </div>
  )
}
