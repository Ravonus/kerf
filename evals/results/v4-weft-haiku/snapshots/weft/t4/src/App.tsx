import { derived, state, watch } from 'weft'
import type { Api, Holding, Quote, Stock } from './api'
import { DetailsPanel, type Details } from './components/DetailsPanel'
import { Header } from './components/Header'
import { StockList } from './components/StockList'

/** The latest price per stock id, with the last 20 prices (oldest first) for its sparkline. */
export type Latest = { price: number; history: number[] }

const HISTORY = 20
const LOADING = { id: '', status: 'loading' as const, text: '' }
const SEARCH_KEY = 'watchlist.search'
const FAVORITES_KEY = 'watchlist.favoritesOnly'

/** localStorage can be missing or throw (blocked storage, private windows): the app works without it. */
function readStored(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function writeStored(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* not persisted */ }
}

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const quotes = state<Record<string, Latest>>({})
  const query = state(readStored(SEARCH_KEY) ?? '')
  /** Ids from the latest successful search; null shows every stock. */
  const found = state<string[] | null>(null)
  const searching = state(false)
  const failed = state(false)
  /** Favorite flags the user changed in this session, by stock id (the list's flag is the default). */
  const favs = state<Record<string, boolean>>({})
  const favOnly = state(readStored(FAVORITES_KEY) === '1')
  const errors = state<string[]>([])
  /** The latest click per stock: a save that is no longer the latest must not undo a newer click. */
  const clicks = new Map<string, number>()
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
  const openStock = derived(() => (openId.value === null ? undefined : byId.value.get(openId.value)))
  const openPrice = derived(() => {
    const id = openId.value
    return id === null ? undefined : quotes.get(id)?.price ?? byId.value.get(id)?.price
  })
  const shown = derived(() => {
    const ids = found.value === null ? null : new Set(found.value)
    // Read the flags only while the filter is on, so a star click doesn't re-filter the list otherwise.
    const flags = favOnly.value ? favs.value : null
    return (stocks.value ?? []).filter(s =>
      (ids === null || ids.has(s.id)) && (flags === null || (flags[s.id] ?? s.favorite)),
    )
  })

  watch(() => api, source => {
    let live = true
    Promise.all([source.listStocks(), source.listHoldings()]).then(([list, hs]) => {
      if (!live) return
      stocks.value = list
      holdings.value = hs
    })
    return () => { live = false }
  })

  // One subscription for the app's lifetime. Quotes are applied once the list has loaded (they need its base price).
  watch(() => api, source => source.subscribeQuotes((q: Quote) => {
    const base = byId.value.get(q.id)
    if (!base) return
    const prev = quotes.value[q.id] ?? { price: base.price, history: [base.price] }
    quotes.value = { ...quotes.value, [q.id]: { price: q.price, history: [...prev.history, q.price].slice(-HISTORY) } }
  }))

  // A derived text: an edit that leaves the trimmed text unchanged wakes nothing (watch alone re-runs on any read change).
  // Each change aborts the request in flight (the cleanup) and sends a new one. Only the current request may write.
  const text = derived(() => query.value.trim())
  watch(() => text.value, text => {
    if (text === '') {
      found.value = null
      searching.value = false
      return
    }
    const ctrl = new AbortController()
    searching.value = true
    api.search(text, ctrl.signal).then(ids => {
      if (ctrl.signal.aborted) return
      found.value = ids
      failed.value = false
      searching.value = false
    }, () => {
      if (ctrl.signal.aborted) return
      failed.value = true
      searching.value = false
    })
    return () => ctrl.abort()
  })

  const loadDetails = (id: string) => {
    const seq = ++detailSeq.n
    detail.value = { id, status: 'loading', text: '' }
    const current = () => seq === detailSeq.n && openId.value === id
    api.details(id).then(d => {
      if (current()) detail.value = { id, status: 'ok', text: d.description }
    }, () => {
      if (current()) detail.value = { id, status: 'error', text: '' }
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

  watch(() => query.value, q => writeStored(SEARCH_KEY, q))
  watch(() => favOnly.value, on => writeStored(FAVORITES_KEY, on ? '1' : '0'))

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
      <label>
        Search <input value={query.value} onInput={e => (query.value = e.currentTarget.value)} />
      </label>
      <label>
        <input type="checkbox" checked={favOnly.value} onChange={e => (favOnly.value = e.currentTarget.checked)} /> Favorites only
      </label>
      {searching.value && <p role="status">Searching…</p>}
      {failed.value && <p role="alert">Search failed</p>}
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
