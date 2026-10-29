import { batch, createEffect, createMemo, createResource, createSignal, on, onCleanup, Show } from 'solid-js'
import { createStore, produce } from 'solid-js/store'
import type { Api, Holding, Stock } from './api'
import { money } from './lib/format'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { HISTORY_LEN, type LiveState } from './quotes'

type Loaded = { stocks: Stock[]; holdings: Holding[] }

const SEARCH_KEY = 'watchlist.search'
const FAV_ONLY_KEY = 'watchlist.favoritesOnly'

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

  // Search. `null` means no search is active (empty text): every stock is shown.
  const [text, setText] = createSignal(readStored(SEARCH_KEY) ?? '')
  const [favOnly, setFavOnly] = createSignal(readStored(FAV_ONLY_KEY) === '1')
  const [results, setResults] = createSignal<string[] | null>(null)
  const [pending, setPending] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  let current: AbortController | undefined

  createEffect(() => writeStored(SEARCH_KEY, text()))
  createEffect(() => writeStored(FAV_ONLY_KEY, favOnly() ? '1' : '0'))

  createEffect(() => {
    const query = text().trim()
    current?.abort()
    current = undefined
    if (!query) {
      setResults(null)
      setPending(false)
      setFailed(false)
      return
    }
    const ctrl = new AbortController()
    current = ctrl
    setPending(true)
    props.api.search(query, ctrl.signal).then(
      ids => {
        if (ctrl.signal.aborted) return
        setResults(ids)
        setFailed(false)
        setPending(false)
      },
      () => {
        if (ctrl.signal.aborted) return
        setFailed(true)
        setPending(false)
      },
    )
  })
  onCleanup(() => current?.abort())

  const visible = createMemo(() => {
    const d = data()
    if (!d) return []
    const ids = results()
    const keep = ids ? new Set(ids) : null
    const onlyFavs = favOnly()
    return d.stocks.filter(s => (!keep || keep.has(s.id)) && (!onlyFavs || favs[s.id]))
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
          <label>
            Search <input type="text" value={text()} onInput={e => setText(e.currentTarget.value)} />
          </label>
          <label>
            <input type="checkbox" checked={favOnly()} onChange={e => setFavOnly(e.currentTarget.checked)} />{' '}
            Favorites only
          </label>
          <Show when={pending()}>
            <p role="status">Searching…</p>
          </Show>
          <Show when={failed()}>
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
