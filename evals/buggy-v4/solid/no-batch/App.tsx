import { batch, createEffect, createMemo, createResource, createSignal, For, mapArray, onCleanup, Show } from 'solid-js'
import { createStore } from 'solid-js/store'
import type { Api, Sector, Stock } from './api'
import { DetailsPanel } from './components/DetailsPanel'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { Toolbar } from './components/Toolbar'
import { createTabSearch, type SearchState } from './search'

export type Live = { price: number; history: number[] }
export type Tab = 'All' | Sector
export type View = { query: string; favoritesOnly: boolean; sort: 'symbol' | 'change' }
type Saved = { tab: Tab; views: Record<Tab, View> }
type Save = { id: string; prev: string }

export const TABS: Tab[] = ['All', 'tech', 'energy', 'health', 'finance']
const VIEW_KEY = 'watchlist:view'
const blank: View = { query: '', favoritesOnly: false, sort: 'symbol' }
const idle: SearchState = { state: 'idle', results: null }
function loadSaved(): Saved {
  const views = Object.fromEntries(TABS.map(t => [t, { ...blank }])) as Record<Tab, View>
  try {
    const saved = JSON.parse(localStorage.getItem(VIEW_KEY) ?? '{}')
    for (const t of TABS) views[t] = { ...blank, ...saved.views?.[t] }
    return { tab: TABS.includes(saved.tab) ? saved.tab : 'All', views }
  } catch {
    return { tab: 'All', views }
  }
}

export function App(props: { api: Api }) {
  const api = props.api
  // Per-stock live state lives in stores keyed by id: a quote writes one stock's fields, so only the
  // computations that read that stock (its row, the panel, the portfolio if held, a Change sort) run again.
  const [live, setLive] = createStore<Record<string, Live>>({})
  const [favorites, setFavorites] = createStore<Record<string, boolean>>({})
  const [notes, setNotes] = createStore<Record<string, string>>({})

  const [data] = createResource(() =>
    Promise.all([api.listStocks(), api.listHoldings()]).then(([stocks, holdings]) => {
      batch(() => {
        setLive(Object.fromEntries(stocks.map(s => [s.id, { price: s.price, history: [s.price] }])))
        setFavorites(Object.fromEntries(stocks.map(s => [s.id, s.favorite])))
      })
      return { stocks, holdings, byId: new Map(stocks.map(s => [s.id, s])) }
    }),
  )

  // The server calls onQuote many times in a row, synchronously. Each call outside a batch would be its own
  // update (and its own portfolio format), so quotes are queued and applied together in one batch on the next
  // microtask: every quote still appends to its sparkline, but each row and the portfolio update once per burst.
  onCleanup(
    api.subscribeQuotes(({ id, price }) => {
      if (live[id]) setLive(id, l => ({ price, history: [...l.history, price].slice(-20) }))
    }),
  )

  const [saved, setSaved] = createStore<Saved>(loadSaved())
  createEffect(() => localStorage.setItem(VIEW_KEY, JSON.stringify(saved)))
  const tab = () => saved.tab
  const view = () => saved.views[saved.tab]
  const setView = (patch: Partial<View>) => setSaved('views', saved.tab, patch)

  // Each tab gets its own search the first time it is shown, and keeps it (and any request in flight) from then on.
  const [visited, setVisited] = createSignal<Tab[]>([saved.tab])
  const searches = createMemo(mapArray(visited, t => ({ tab: t, search: createTabSearch(api, () => saved.views[t].query) })))
  const selectTab = (t: Tab) =>
    batch(() => {
      setSaved('tab', t)
      if (!visited().includes(t)) setVisited(v => [...v, t])
    })
  const search = (): SearchState => searches().find(s => s.tab === tab())?.search ?? idle

  const [alert, setAlert] = createSignal<string | null>(null)
  const clicks = new Map<string, number>()
  const toggle = (stock: Stock) => {
    const before = favorites[stock.id]
    const click = (clicks.get(stock.id) ?? 0) + 1
    clicks.set(stock.id, click)
    setFavorites(stock.id, !before)
    api.setFavorite(stock.id, !before).catch(() => {
      batch(() => {
        if (clicks.get(stock.id) === click) setFavorites(stock.id, before)
        setAlert(`Couldn't update ${stock.symbol}`)
      })
    })
  }

  const [openId, setOpenId] = createSignal<string | null>(null)
  let opener: HTMLElement | undefined
  const openDetails = (id: string, button: HTMLElement) => {
    opener = button
    setOpenId(id)
  }
  const closeDetails = () => {
    setOpenId(null)
    opener?.focus()
    opener = undefined
  }

  const [saves, setSaves] = createSignal<Save[]>([])
  const save = (id: string, text: string) =>
    batch(() => {
      setSaves(s => [...s, { id, prev: notes[id] ?? '' }])
      setNotes(id, text)
    })
  const undo = () => {
    const last = saves().at(-1)
    if (!last) return
    batch(() => {
      setSaves(s => s.slice(0, -1))
      setNotes(last.id, last.prev)
    })
  }

  // The rows keep their identity (the same Stock objects from the load), so <For> only adds, removes and moves rows.
  const filtered = createMemo(() => {
    const all = data()?.stocks ?? []
    const t = tab()
    const ids = search().results
    const onlyFavorites = view().favoritesOnly
    return all.filter(s => (t === 'All' || s.sector === t) && (!ids || ids.has(s.id)) && (!onlyFavorites || favorites[s.id]))
  })
  // Only the Change sort reads live prices, so quotes don't re-sort a Symbol-sorted list. Array#sort is stable,
  // which keeps ties in list order.
  const shown = createMemo(() => {
    const rows = filtered()
    if (view().sort !== 'change') return rows
    const change = new Map(rows.map(s => [s, (live[s.id].price - s.prevClose) / s.prevClose]))
    return [...rows].sort((a, b) => change.get(b)! - change.get(a)!)
  })
  const portfolio = createMemo(() => (data()?.holdings ?? []).reduce((sum, h) => sum + h.qty * (live[h.id]?.price ?? 0), 0))

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {loaded => (
        <div>
          <Header count={shown().length} portfolio={portfolio()} />
          <nav>
            <For each={TABS}>{t => <button aria-pressed={t === tab()} onClick={() => selectTab(t)}>{t}</button>}</For>
          </nav>
          <Toolbar view={view()} onView={setView} />
          <p role="status">{search().state === 'pending' ? 'Searching…' : ''}</p>
          <Show when={search().state === 'failed'}><p role="alert">Search failed</p></Show>
          <Show when={alert()}>{message => <p role="alert">{message()}</p>}</Show>
          <StockList stocks={shown()} live={live} favorites={favorites} onToggle={toggle} onDetails={openDetails} />
          <Show when={loaded().byId.get(openId() ?? '')} keyed>
            {stock => (
              <DetailsPanel
                api={api}
                stock={stock}
                price={live[stock.id].price}
                note={notes[stock.id] ?? ''}
                canUndo={saves().length > 0}
                onSave={save}
                onUndo={undo}
                onClose={closeDetails}
              />
            )}
          </Show>
        </div>
      )}
    </Show>
  )
}
