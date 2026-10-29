import { state, derived, watch, batch, flush } from 'weft'
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

export function App({ api }: { api: Api }) {
  const stocks = state<Stock[] | null>(null)
  const holdings = state<Holding[]>([])
  const live = state<LiveMap>({})
  const query = state(load('watchlist.search') ?? '')
  const favoritesOnly = state(load('watchlist.favoritesOnly') === 'true')
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
  const matched = state<string[] | null>(null)
  const pending = state(false)
  const failed = state(false)
  const shown = derived(() => {
    const all = stocks.value
    const ids = matched.value
    if (!all) return all
    const set = ids ? new Set(ids) : null
    const onlyFav = favoritesOnly.value
    if (!set && !onlyFav) return all
    return all.filter(s => (!set || set.has(s.id)) && (!onlyFav || favs.value[s.id]))
  })

  watch(() => query.value, text => { save('watchlist.search', text) })
  watch(() => favoritesOnly.value, on => { save('watchlist.favoritesOnly', String(on)) })

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

  watch(() => query.value.trim(), (text, ) => {
    if (!text) {
      matched.value = null
      pending.value = false
      failed.value = false
      return
    }
    const ctrl = new AbortController()
    pending.value = true
    api.search(text, ctrl.signal).then(ids => {
      if (ctrl.signal.aborted) return
      batch(() => {
        matched.value = ids
        pending.value = false
        failed.value = false
      })
    }, () => {
      if (ctrl.signal.aborted) return
      batch(() => {
        pending.value = false
        failed.value = true
      })
    })
    return () => ctrl.abort()
  })

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
          <label>
            Search
            <input value={query.value} onInput={e => { query.value = e.currentTarget.value }} />
          </label>
          <label>
            <input type="checkbox" checked={favoritesOnly.value} onChange={e => { favoritesOnly.value = e.currentTarget.checked }} />
            Favorites only
          </label>
          {failedFavs.value.map(id => (
            <p key={id} role="alert">Couldn't update {stocks.value?.find(s => s.id === id)?.symbol}</p>
          ))}
          {pending.value && <p role="status">Searching…</p>}
          {failed.value && <p role="alert">Search failed</p>}
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
