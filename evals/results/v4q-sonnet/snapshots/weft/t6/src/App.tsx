import { state, derived, watch, batch, flush, type State } from 'weft'
import type { Api, Holding, Stock } from './api'
import { Header } from './components/Header'
import { Details } from './components/Details'
import { StockList } from './components/StockList'
import { HISTORY, type LiveMap } from './live'

function load(key: string): string | null {
  try { return localStorage.getItem(key) } catch { return null }
}
function save(key: string, value: string) {
  try { localStorage.setItem(key, value) } catch { /* storage unavailable */ }
}

const TABS = ['All', 'tech', 'energy', 'health', 'finance']

type TabState = {
  query: State<string>
  favoritesOnly: State<boolean>
  sort: State<string>
  matched: State<string[] | null>
  pending: State<boolean>
  failed: State<boolean>
  visited: State<boolean>
}

function makeTab(name: string, getApi: () => Api, current: State<string>): TabState {
  const k = (field: string) => (name === 'All' ? `watchlist.${field}` : `watchlist.${name}.${field}`)
  const t: TabState = {
    query: state(load(k('search')) ?? ''),
    favoritesOnly: state(load(k('favoritesOnly')) === 'true'),
    sort: state(load(k('sort')) === 'change' ? 'change' : 'symbol'),
    matched: state<string[] | null>(null),
    pending: state(false),
    failed: state(false),
    visited: state(current.value === name),
  }
  watch(() => t.query.value, v => { save(k('search'), v) })
  watch(() => t.sort.value, v => { save(k('sort'), v) })
  watch(() => t.favoritesOnly.value, v => { save(k('favoritesOnly'), String(v)) })
  // each tab runs its own search; switching away never aborts it, only a newer query in this tab does
  watch(() => (t.visited.value ? t.query.value.trim() : null), text => {
    if (text === null) return
    if (!text) {
      batch(() => { t.matched.value = null; t.pending.value = false; t.failed.value = false })
      return
    }
    const ctrl = new AbortController()
    t.pending.value = true
    getApi().search(text, ctrl.signal).then(ids => {
      if (ctrl.signal.aborted) return
      batch(() => { t.matched.value = ids; t.pending.value = false; t.failed.value = false })
    }, () => {
      if (ctrl.signal.aborted) return
      batch(() => { t.pending.value = false; t.failed.value = true })
    })
    return () => ctrl.abort()
  })
  return t
}

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const live = state<LiveMap>({})
  const tab = state<string>(TABS.includes(load('watchlist.tab') ?? '') ? load('watchlist.tab')! : 'All')
  const T: Record<string, TabState> = {}
  for (const name of TABS) T[name] = makeTab(name, () => api, tab)
  const cur = () => T[tab.value]
  const selectTab = (name: string) => { T[name].visited.value = true; tab.value = name }
  watch(() => tab.value, name => { save('watchlist.tab', name) })
  const favs = state<Record<string, boolean>>({})
  const failedFavs = state<string[]>([])
  const clicks: Record<string, number> = {}
  const openId = state<string | null>(null)
  const notes = state<Record<string, string>>({})
  const undoStack = state<{ id: string; prev: string }[]>([])
  const draft = state('')
  const openStock = derived(() => stocks.value?.find(s => s.id === openId.value) ?? null)

  watch(() => (openId.value === null ? '\0' : `${openId.value}\0${notes.value[openId.value] ?? ''}`), () => {
    const id = openId.value
    draft.value = id === null ? '' : notes.value[id] ?? ''
  })

  const open = (id: string) => {
    openId.value = id
    flush()
    document.getElementById('notes-field')?.focus()
  }
  const close = () => {
    const sym = openStock.value?.symbol
    openId.value = null
    flush()
    if (sym) document.querySelector<HTMLElement>(`button[aria-label="Details ${sym}"]`)?.focus()
  }
  const saveNote = () => {
    const id = openId.value
    if (id === null) return
    batch(() => {
      undoStack.value = [...undoStack.value, { id, prev: notes.value[id] ?? '' }]
      notes.value = { ...notes.value, [id]: draft.value }
    })
  }
  const undoNote = () => {
    const top = undoStack.value[undoStack.value.length - 1]
    if (!top) return
    batch(() => {
      undoStack.value = undoStack.value.slice(0, -1)
      notes.value = { ...notes.value, [top.id]: top.prev }
    })
  }
  let lastShown: Stock[] | null = null
  const shown = derived(() => {
    const all = stocks.value
    if (!all) return all
    const t = cur()
    const name = tab.value
    const ids = t.matched.value
    const set = ids ? new Set(ids) : null
    const onlyFav = t.favoritesOnly.value
    let out = name === 'All' && !set && !onlyFav
      ? all
      : all.filter(s => (name === 'All' || s.sector === name) && (!set || set.has(s.id)) && (!onlyFav || favs.value[s.id]))
    if (t.sort.value === 'change') {
      const l = live.value
      const key = new Map<string, number>()
      for (const s of out) key.set(s.id, ((l[s.id]?.price ?? s.price) - s.prevClose) / s.prevClose)
      const idx = new Map(out.map((s, i) => [s.id, i]))
      out = [...out].sort((a, b) => key.get(b.id)! - key.get(a.id)! || idx.get(a.id)! - idx.get(b.id)!)
    }
    // keep the same array when the order did not change, so the list does no work
    if (lastShown && lastShown.length === out.length && lastShown.every((s, i) => s === out[i])) return lastShown
    lastShown = out
    return out
  })

  const toggleFavorite = (id: string) => {
    const before = !!favs.value[id]
    const after = !before
    const n = (clicks[id] ?? 0) + 1
    clicks[id] = n
    batch(() => {
      favs.value = { ...favs.value, [id]: after }
      failedFavs.value = failedFavs.value.filter(x => x !== id)
    })
    api.setFavorite(id, after).catch(() => {
      batch(() => {
        if (clicks[id] === n) favs.value = { ...favs.value, [id]: before }
        if (!failedFavs.value.includes(id)) failedFavs.value = [...failedFavs.value, id]
      })
    })
  }

  const portfolio = derived(() =>
    holdings.value.reduce((sum, h) => sum + h.qty * (live.get(h.id)?.price ?? 0), 0),
  )

  watch(() => api, source => {
    let alive = true
    let loaded = false
    let pending: { id: string; price: number }[] = []

    const apply = (quotes: { id: string; price: number }[]) => {
      const next: LiveMap = { ...live.value }
      for (const q of quotes) {
        const cur = next[q.id]
        if (!cur) continue
        next[q.id] = { price: q.price, history: [...cur.history, q.price].slice(-HISTORY) }
      }
      live.value = next
    }

    const unsubscribe = source.subscribeQuotes(q => {
      if (!alive) return
      if (!loaded) pending.push(q)
      else apply([q])
    })

    Promise.all([source.listStocks(), source.listHoldings()]).then(([list, h]) => {
      if (!alive) return
      const map: LiveMap = {}
      const f: Record<string, boolean> = {}
      for (const s of list) { map[s.id] = { price: s.price, history: [s.price] }; f[s.id] = s.favorite }
      batch(() => {
        favs.value = f
        live.value = map
        holdings.value = h
        stocks.value = list
      })
      loaded = true
      if (pending.length) apply(pending)
      pending = []
    })
    return () => { alive = false; unsubscribe() }
  })

  return (
    <>
      {!stocks.value ? (
        <p>Loading…</p>
      ) : (
        <div>
          <Header count={shown.value?.length ?? 0} portfolio={portfolio.value} />
          <div>
            {TABS.map(name => (
              <button key={name} type="button" aria-pressed={tab.value === name ? 'true' : 'false'} onClick={() => selectTab(name)}>{name}</button>
            ))}
          </div>
          <label>
            Search
            <input value={cur().query.value} onInput={e => { cur().query.value = e.currentTarget.value }} />
          </label>
          <label>
            Sort
            <select value={cur().sort.value} onChange={e => { cur().sort.value = e.currentTarget.value }}>
              <option value="symbol">Symbol</option>
              <option value="change">Change</option>
            </select>
          </label>
          <label>
            <input type="checkbox" checked={cur().favoritesOnly.value} onChange={e => { cur().favoritesOnly.value = e.currentTarget.checked }} />
            Favorites only
          </label>
          {failedFavs.value.map(id => (
            <p key={id} role="alert">Couldn't update {stocks.value?.find(s => s.id === id)?.symbol}</p>
          ))}
          {cur().pending.value && <p role="status">Searching…</p>}
          {cur().failed.value && <p role="alert">Search failed</p>}
          <StockList stocks={shown.value ?? []} live={live} favs={favs} onToggle={toggleFavorite} onOpen={open} />
          {openStock.value && (
            <Details stock={openStock.value} api={api} live={live} draft={draft} canUndo={undoStack.value.length > 0}
              onSave={saveNote} onUndo={undoNote} onClose={close} />
          )}
        </div>
      )}
    </>
  )
}
