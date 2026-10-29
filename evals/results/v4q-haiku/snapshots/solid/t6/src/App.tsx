import { batch, createEffect, createMemo, createResource, createSignal, For, on, onCleanup, Show } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import type { Api, Holding, Sector, Stock } from './api'
import { money } from './lib/format'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { HISTORY_LEN, type LiveState } from './quotes'

type Loaded = { stocks: Stock[]; holdings: Holding[] }

const TAB_KEY = 'watchlist.tab'

type SortMode = 'symbol' | 'change'
type Tab = 'All' | Sector
const TABS: Tab[] = ['All', 'tech', 'energy', 'health', 'finance']

// Per-tab settings keys. The All tab keeps the original unprefixed keys.
function keyOf(tab: Tab, field: 'search' | 'favoritesOnly' | 'sort'): string {
  return tab === 'All' ? `watchlist.${field}` : `watchlist.${tab}.${field}`
}

// localStorage can be missing or blocked; the app then just starts with defaults.
function readStored(key: string): string | null {
  try {
    return localStorage.getItem(key)
  } catch {
    return null
  }
}
function writeStored(key: string, value: string) {
  try {
    localStorage.setItem(key, value)
  } catch {
    // ignore: persistence is a convenience
  }
}

export function App(props: { api: Api }) {
  const [live, setLive] = createStore<LiveState>({})
  const [favs, setFavs] = createStore<Record<string, boolean>>({})

  const [data] = createResource(() =>
    Promise.all([props.api.listStocks(), props.api.listHoldings()]).then(([stocks, holdings]): Loaded => {
      const init: LiveState = {}
      const favInit: Record<string, boolean> = {}
      for (const s of stocks) {
        init[s.id] = { price: s.price, history: [s.price] }
        favInit[s.id] = s.favorite
      }
      setLive(init)
      setFavs(favInit)
      return { stocks, holdings }
    }),
  )

  // One subscription for the whole app, closed on unmount.
  const unsubscribe = props.api.subscribeQuotes(q => {
    if (!live[q.id]) return
    batch(() =>
      setLive(
        q.id,
        produce(s => {
          s.price = q.price
          s.history.push(q.price)
          if (s.history.length > HISTORY_LEN) s.history.splice(0, s.history.length - HISTORY_LEN)
        }),
      ),
    )
  })
  onCleanup(unsubscribe)

  // Depends only on the prices of held stocks, so it updates only when one of them moves.
  const portfolio = createMemo(() => {
    const d = data()
    if (!d) return 0
    return d.holdings.reduce((sum, h) => sum + h.qty * (live[h.id]?.price ?? 0), 0)
  })

  // Favorites. The star flips at once and is saved; a refused save puts it back unless clicked again since.
  let clickSeq = 0
  const lastClick: Record<string, number> = {}
  const [favError, setFavError] = createSignal<string | null>(null)

  function toggleFavorite(stock: Stock) {
    const before = favs[stock.id]
    const mine = ++clickSeq
    lastClick[stock.id] = mine
    setFavs(stock.id, !before)
    props.api.setFavorite(stock.id, !before).then(
      () => setFavError(null),
      () => {
        if (lastClick[stock.id] === mine) setFavs(stock.id, before)
        setFavError(`Couldn't update ${stock.symbol}`)
      },
    )
  }

  // Sector tabs. Each tab has its own search text, Favorites only, Sort and search results.
  type TabState = {
    text: string
    favOnly: boolean
    sort: SortMode
    ids: string[] | null // null: no search applied (all stocks)
    pending: boolean
    failed: boolean
  }
  const [tabs, setTabs] = createStore<Record<Tab, TabState>>(
    Object.fromEntries(
      TABS.map(tab => [
        tab,
        {
          text: readStored(keyOf(tab, 'search')) ?? '',
          favOnly: readStored(keyOf(tab, 'favoritesOnly')) === '1',
          sort: readStored(keyOf(tab, 'sort')) === 'change' ? 'change' : 'symbol',
          ids: null,
          pending: false,
          failed: false,
        } satisfies TabState,
      ]),
    ) as Record<Tab, TabState>,
  )
  const [selected, setSelected] = createSignal<Tab>('All')

  // A request belongs to its tab. Only a newer query in the same tab aborts it.
  const controllers: Partial<Record<Tab, AbortController>> = {}

  function runSearch(tab: Tab) {
    controllers[tab]?.abort()
    delete controllers[tab]
    const query = tabs[tab].text.trim()
    if (!query) {
      setTabs(tab, { ids: null, pending: false, failed: false })
      return
    }
    const ctrl = new AbortController()
    controllers[tab] = ctrl
    setTabs(tab, { pending: true })
    props.api.search(query, ctrl.signal).then(
      ids => {
        if (ctrl.signal.aborted) return
        setTabs(tab, { ids, pending: false, failed: false })
      },
      () => {
        if (ctrl.signal.aborted) return
        setTabs(tab, { pending: false, failed: true })
      },
    )
  }
  onCleanup(() => {
    for (const c of Object.values(controllers)) c?.abort()
  })

  // A tab's restored search runs the first time the tab is shown.
  const shownTabs = new Set<Tab>()
  function showTab(tab: Tab) {
    setSelected(tab)
    writeStored(TAB_KEY, tab)
    if (shownTabs.has(tab)) return
    shownTabs.add(tab)
    if (tabs[tab].text.trim()) runSearch(tab)
  }

  function setSearchText(value: string) {
    const tab = selected()
    setTabs(tab, 'text', value)
    writeStored(keyOf(tab, 'search'), value)
    runSearch(tab)
  }
  function setFavOnly(on: boolean) {
    const tab = selected()
    setTabs(tab, 'favOnly', on)
    writeStored(keyOf(tab, 'favoritesOnly'), on ? '1' : '0')
  }
  function setSort(sort: SortMode) {
    const tab = selected()
    setTabs(tab, 'sort', sort)
    writeStored(keyOf(tab, 'sort'), sort)
  }

  const storedTab = readStored(TAB_KEY)
  showTab(TABS.includes(storedTab as Tab) ? (storedTab as Tab) : 'All')

  // List order: the position of each stock in the loaded list, used for ties and the Symbol sort.
  const listOrder = createMemo(() => new Map((data()?.stocks ?? []).map((s, i) => [s.id, i])))

  const visible = createMemo(() => {
    const d = data()
    if (!d) return []
    const tab = selected()
    const t = tabs[tab]
    const keep = t.ids ? new Set(t.ids) : null
    const sector = tab === 'All' ? null : tab
    const onlyFavs = t.favOnly
    const shown = d.stocks.filter(
      s => (!sector || s.sector === sector) && (!keep || keep.has(s.id)) && (!onlyFavs || favs[s.id]),
    )
    // Symbol order is list order and reads no prices, so quotes never re-sort the list in that mode.
    if (t.sort === 'symbol') return shown
    const order = listOrder()
    const change = (s: Stock) => (live[s.id].price - s.prevClose) / s.prevClose
    return shown
      .map(s => ({ s, c: change(s) }))
      .sort((a, b) => b.c - a.c || order.get(a.s.id)! - order.get(b.s.id)!)
      .map(x => x.s)
  })

  // Details panel. A description response only counts if it belongs to the panel's current load.
  type DetailState = { status: 'loading' } | { status: 'ok'; description: string } | { status: 'error' }
  const [openId, setOpenId] = createSignal<string | null>(null)
  const [detail, setDetail] = createSignal<DetailState>({ status: 'loading' })
  let detailSeq = 0
  let opener: HTMLElement | undefined
  let notesEl: HTMLTextAreaElement | undefined

  const openStock = createMemo(() => {
    const id = openId()
    const d = data()
    return id && d ? d.stocks.find(s => s.id === id) : undefined
  })
  const detailPrice = createMemo(() => {
    const id = openId()
    const entry = id ? live[id] : undefined
    return entry ? money(entry.price) : ''
  })

  function loadDetails(id: string) {
    const token = ++detailSeq
    setDetail({ status: 'loading' })
    props.api.details(id).then(
      d => {
        if (token === detailSeq) setDetail({ status: 'ok', description: d.description })
      },
      () => {
        if (token === detailSeq) setDetail({ status: 'error' })
      },
    )
  }

  // Notes. Saved notes live in memory; the undo stack spans all stocks.
  const [notes, setNotes] = createStore<Record<string, string>>({})
  const [draft, setDraft] = createSignal('')
  const [undoStack, setUndoStack] = createSignal<{ id: string; before: string }[]>([])

  function openDetails(stock: Stock, el: HTMLElement) {
    opener = el
    if (openId() === stock.id) {
      notesEl?.focus()
      return
    }
    setOpenId(stock.id)
    setDraft(notes[stock.id] ?? '')
    loadDetails(stock.id)
  }

  function closeDetails() {
    const el = opener
    detailSeq++ // ignore any description still in flight
    setOpenId(null)
    el?.focus()
  }

  function saveNote() {
    const id = openId()
    if (!id) return
    const text = draft()
    setUndoStack(st => [...st, { id, before: notes[id] ?? '' }])
    setNotes(id, text)
  }

  function undoNote() {
    const st = undoStack()
    const top = st[st.length - 1]
    if (!top) return
    setUndoStack(st.slice(0, -1))
    setNotes(top.id, top.before)
    if (top.id === openId()) setDraft(top.before)
  }

  createEffect(
    on(openId, id => {
      if (id) notesEl?.focus()
    }),
  )

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {_loaded => (
        <div>
          <Header count={visible().length} portfolio={portfolio()} />
          <nav>
            <For each={TABS}>
              {tab => (
                <button type="button" aria-pressed={selected() === tab} onClick={() => showTab(tab)}>
                  {tab}
                </button>
              )}
            </For>
          </nav>
          <label>
            Search <input type="text" value={tabs[selected()].text} onInput={e => setSearchText(e.currentTarget.value)} />
          </label>
          <label>
            Sort{' '}
            <select
              value={tabs[selected()].sort}
              onChange={e => setSort(e.currentTarget.value as SortMode)}
            >
              <option value="symbol">Symbol</option>
              <option value="change">Change</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={tabs[selected()].favOnly}
              onChange={e => setFavOnly(e.currentTarget.checked)}
            />{' '}
            Favorites only
          </label>
          <Show when={tabs[selected()].pending}>
            <p role="status">Searching…</p>
          </Show>
          <Show when={tabs[selected()].failed}>
            <p role="alert">Search failed</p>
          </Show>
          <Show when={favError()}>
            <p role="alert">{favError()}</p>
          </Show>
          <StockList
            stocks={visible()}
            live={live}
            favs={favs}
            onToggle={toggleFavorite}
            onOpen={openDetails}
          />
          <Show when={openStock()}>
            {s => (
              <section
                role="region"
                aria-label="Details"
                onKeyDown={e => {
                  if (e.key === 'Escape') closeDetails()
                }}
              >
                <h2>
                  {s().symbol} {s().name}
                </h2>
                <p>
                  Price: <span data-testid="detail-price">{detailPrice()}</span>
                </p>
                <Show when={detail().status === 'loading'}>
                  <p>Loading…</p>
                </Show>
                <Show when={detail().status === 'ok'}>
                  <p>{detail().status === 'ok' ? (detail() as { description: string }).description : ''}</p>
                </Show>
                <Show when={detail().status === 'error'}>
                  <p role="alert">Couldn't load details</p>
                  <button type="button" onClick={() => loadDetails(s().id)}>
                    Retry
                  </button>
                </Show>
                <label>
                  Notes{' '}
                  <textarea
                    ref={el => (notesEl = el)}
                    value={draft()}
                    onInput={e => setDraft(e.currentTarget.value)}
                  />
                </label>
                <button type="button" onClick={saveNote}>
                  Save
                </button>
                <button type="button" onClick={undoNote} disabled={undoStack().length === 0}>
                  Undo
                </button>
              </section>
            )}
          </Show>
        </div>
      )}
    </Show>
  )
}
