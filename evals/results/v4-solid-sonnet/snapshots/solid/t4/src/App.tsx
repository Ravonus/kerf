import { batch, For, createMemo, createResource, createSignal, onCleanup, Show, type Accessor } from 'solid-js'
import type { Api, Holding, Stock } from './api'
import { Header } from './components/Header'
import { DetailsPanel } from './components/DetailsPanel'
import { StockList } from './components/StockList'

export type Live = { price: Accessor<number>; history: Accessor<number[]>; favorite: Accessor<boolean> }
type Entry = Live & { push: (p: number) => void; setFavorite: (f: boolean) => void; clicks: number }

function makeEntry(initial: number, fav: boolean): Entry {
  const [favorite, setFavorite] = createSignal(fav)
  const [price, setPrice] = createSignal(initial)
  const [history, setHistory] = createSignal([initial])
  return {
    price,
    history,
    favorite,
    setFavorite,
    clicks: 0,
    push(p) {
      batch(() => {
        setPrice(p)
        setHistory(h => [...h.slice(-19), p])
      })
    },
  }
}

export function App(props: { api: Api }) {
  const entries = new Map<string, Entry>()
  let early: { id: string; price: number }[] | null = []
  const apply = (q: { id: string; price: number }) => entries.get(q.id)?.push(q.price)

  const unsubscribe = props.api.subscribeQuotes(q => (early ? early.push(q) : apply(q)))
  onCleanup(unsubscribe)

  const store = {
    get(k: string) {
      try {
        return localStorage.getItem(k)
      } catch {
        return null
      }
    },
    set(k: string, v: string) {
      try {
        localStorage.setItem(k, v)
      } catch {}
    },
  }
  const [openId, setOpenId] = createSignal<string | null>(null)
  const [notes, setNotes] = createSignal<Record<string, string>>({})
  const [undoStack, setUndoStack] = createSignal<{ id: string; prev: string | undefined }[]>([])
  let opener: HTMLElement | null = null
  function openDetails(s: Stock, el: HTMLElement) {
    opener = el
    setOpenId(s.id)
  }
  function closeDetails() {
    setOpenId(null)
    if (opener?.isConnected) opener.focus()
  }
  function saveNote(id: string, text: string) {
    const prev = notes()[id]
    batch(() => {
      setUndoStack(u => [...u, { id, prev }])
      setNotes(n => ({ ...n, [id]: text }))
    })
  }
  function undoNote() {
    const u = undoStack()
    const last = u[u.length - 1]
    if (!last) return
    batch(() => {
      setUndoStack(u.slice(0, -1))
      setNotes(n => {
        const c = { ...n }
        if (last.prev === undefined) delete c[last.id]
        else c[last.id] = last.prev
        return c
      })
    })
  }

  const [text, setText] = createSignal(store.get('watchlist.search') ?? '')
  const [favOnly, setFavOnly] = createSignal(store.get('watchlist.favoritesOnly') === 'true')
  const [favErrors, setFavErrors] = createSignal<{ id: string; symbol: string }[]>([])

  function toggleFavorite(stock: Stock) {
    const e = entries.get(stock.id)!
    const before = e.favorite()
    const next = !before
    const mine = ++e.clicks
    e.setFavorite(next)
    setFavErrors(l => l.filter(x => x.id !== stock.id))
    props.api.setFavorite(stock.id, next).catch(() => {
      if (e.clicks === mine) e.setFavorite(before)
      setFavErrors(l => [...l.filter(x => x.id !== stock.id), { id: stock.id, symbol: stock.symbol }])
    })
  }
  const [matched, setMatched] = createSignal<Set<string> | null>(null)
  const [pending, setPending] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  let ctrl: AbortController | null = null
  let lastQuery = ''
  onCleanup(() => ctrl?.abort())

  function onSearch(value: string) {
    setText(value)
    store.set('watchlist.search', value)
    const q = value.trim()
    if (q === lastQuery) return
    lastQuery = q
    ctrl?.abort()
    ctrl = null
    if (!q) {
      batch(() => {
        setMatched(null)
        setPending(false)
        setFailed(false)
      })
      return
    }
    const mine = (ctrl = new AbortController())
    setPending(true)
    props.api.search(q, mine.signal).then(
      ids =>
        ctrl === mine &&
        batch(() => {
          setMatched(new Set(ids))
          setPending(false)
          setFailed(false)
        }),
      () =>
        ctrl === mine &&
        batch(() => {
          setPending(false)
          setFailed(true)
        }),
    )
  }

  if (text().trim()) onSearch(text())

  const [data] = createResource(() =>
    Promise.all([props.api.listStocks(), props.api.listHoldings()]).then(([list, holdings]) => {
      for (const s of list) entries.set(s.id, makeEntry(s.price, s.favorite))
      const queued = early!
      early = null
      batch(() => queued.forEach(apply))
      return { stocks: list, holdings }
    }),
  )

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {loaded => {
        const portfolio = createMemo(() =>
          loaded().holdings.reduce((sum: number, h: Holding) => sum + h.qty * (entries.get(h.id)?.price() ?? 0), 0),
        )
        const visible = createMemo(() => {
          const ids = matched()
          const only = favOnly()
          if (!ids && !only) return loaded().stocks
          return loaded().stocks.filter(s => (!ids || ids.has(s.id)) && (!only || entries.get(s.id)!.favorite()))
        })
        const openStock = createMemo(() => {
          const id = openId()
          return id ? loaded().stocks.find(s => s.id === id) : undefined
        })
        return (
          <div>
            <Header count={visible().length} portfolio={portfolio()} />
            <label>
              Search
              <input type="text" value={text()} onInput={e => onSearch(e.currentTarget.value)} />
            </label>
            <label>
              <input
                type="checkbox"
                checked={favOnly()}
                onChange={e => {
                  setFavOnly(e.currentTarget.checked)
                  store.set('watchlist.favoritesOnly', String(e.currentTarget.checked))
                }}
              />
              Favorites only
            </label>
            <For each={favErrors()}>{x => <p role="alert">Couldn't update {x.symbol}</p>}</For>
            <Show when={pending()}>
              <p role="status">Searching…</p>
            </Show>
            <Show when={failed()}>
              <p role="alert">Search failed</p>
            </Show>
            <Show when={openStock()} keyed>
              {s => (
                <DetailsPanel
                  api={props.api}
                  stock={s}
                  live={entries.get(s.id)!}
                  note={() => notes()[s.id]}
                  canUndo={() => undoStack().length > 0}
                  onSave={t => saveNote(s.id, t)}
                  onUndo={undoNote}
                  onClose={closeDetails}
                />
              )}
            </Show>
            <StockList stocks={visible()} live={id => entries.get(id)!} onFavorite={toggleFavorite} onOpen={openDetails} />
          </div>
        )
      }}
    </Show>
  )
}
