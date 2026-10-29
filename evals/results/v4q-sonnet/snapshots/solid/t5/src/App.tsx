import { batch, createMemo, For, createResource, createSignal, onCleanup, Show } from 'solid-js'
import type { Api, Stock } from './api'
import { Header } from './components/Header'
import { DetailsPanel } from './components/DetailsPanel'
import { StockList } from './components/StockList'
import { createLive } from './quotes'

type Live = ReturnType<typeof createLive>

export function App(props: { api: Api }) {
  let live: Live | undefined
  const pending: { id: string; price: number }[] = []

  // One subscription for the app; quotes that arrive before the list has loaded are buffered.
  // Bursts are coalesced: all quotes of a synchronous burst are applied in one batch, so each affected
  // row/sparkline is recomputed once, not once per quote.
  let scheduled = false
  let closed = false
  function flush() {
    scheduled = false
    if (!live || closed) return
    const l = live
    batch(() => {
      for (const q of pending.splice(0)) l.byId.get(q.id)?.push(q.price)
    })
  }
  const unsubscribe = props.api.subscribeQuotes(q => {
    pending.push(q)
    if (live && !scheduled) {
      scheduled = true
      queueMicrotask(flush)
    }
  })
  onCleanup(() => {
    closed = true
  })
  onCleanup(unsubscribe)

  // Search: only the latest query's outcome is ever applied.
  const load = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
  const save = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} }
  const [text, setText] = createSignal('')
  const [sort, setSort] = createSignal<'symbol' | 'change'>(load('watchlist.sort') === 'change' ? 'change' : 'symbol')
  const [favOnly, setFavOnly] = createSignal(load('watchlist.favOnly') === '1')
  const [favErrors, setFavErrors] = createSignal<Record<string, string>>({})
  const [matches, setMatches] = createSignal<Set<string> | null>(null)
  const [pendingSearch, setPendingSearch] = createSignal(false)
  const [failed, setFailed] = createSignal(false)
  let controller: AbortController | undefined
  let current = ''
  onCleanup(() => controller?.abort())

  function onSearch(value: string) {
    setText(value)
    save('watchlist.search', value)
    const q = value.trim()
    if (q === current) return
    current = q
    controller?.abort()
    controller = undefined
    if (q === '') {
      setMatches(null)
      setPendingSearch(false)
      setFailed(false)
      return
    }
    const mine = (controller = new AbortController())
    setPendingSearch(true)
    props.api.search(q, mine.signal).then(
      ids => {
        if (controller !== mine) return
        setMatches(new Set(ids))
        setFailed(false)
        setPendingSearch(false)
      },
      () => {
        if (controller !== mine) return
        setFailed(true)
        setPendingSearch(false)
      },
    )
  }

  // Details panel and notes.
  const [openId, setOpenId] = createSignal<string | null>(null)
  const [notes, setNotes] = createSignal<Record<string, string>>({})
  const [undoStack, setUndoStack] = createSignal<{ id: string; prev: string | undefined }[]>([])
  function saveNote(id: string, text: string) {
    setUndoStack(st => [...st, { id, prev: notes()[id] }])
    setNotes(n => ({ ...n, [id]: text }))
  }
  function undoNote() {
    const st = undoStack()
    const top = st[st.length - 1]
    if (!top) return
    setUndoStack(st.slice(0, -1))
    setNotes(n => {
      const { [top.id]: _, ...rest } = n
      return top.prev === undefined ? rest : { ...rest, [top.id]: top.prev }
    })
  }
  function closePanel(id: string, symbol: string) {
    setOpenId(null)
    const btn = document.querySelector<HTMLElement>(`button[aria-label="Details ${symbol}"]`)
    btn?.focus()
  }

  const saved = load('watchlist.search')
  if (saved) onSearch(saved)

  function toggle(id: string) {
    const l = live?.byId.get(id)
    if (!l) return
    const stock = stocksById.get(id)!
    const prev = l.favorite()
    const click = ++l.clicks
    l.setFavorite(!prev)
    setFavErrors(e => { const { [id]: _, ...rest } = e; return rest })
    props.api.setFavorite(id, !prev).catch(() => {
      if (l.clicks === click) {
        l.setFavorite(prev)
      }
      setFavErrors(e => ({ ...e, [id]: `Couldn't update ${stock.symbol}` }))
    })
  }
  const stocksById = new Map<string, Stock>()

  const [data] = createResource(() =>
    Promise.all([props.api.listStocks(), props.api.listHoldings()]).then(([stocks, holdings]) => {
      live = createLive(stocks, holdings)
      for (const st of stocks) stocksById.set(st.id, st)
      flush()
      return { stocks, live }
    }),
  )

  return (
    <Show when={data()} fallback={<p>Loading…</p>}>
      {loaded => {
        const shown = createMemo(() => {
          const m = matches()
          const fo = favOnly()
          const byId = loaded().live.byId
          const filtered = m || fo ? loaded().stocks.filter(s => (!m || m.has(s.id)) && (!fo || byId.get(s.id)!.favorite())) : loaded().stocks
          if (sort() !== 'change') return filtered
          const keyed = filtered.map((s, i) => ({ s, i, c: (byId.get(s.id)!.price() - s.prevClose) / s.prevClose }))
          keyed.sort((a, b) => b.c - a.c || a.i - b.i)
          return keyed.map(k => k.s)
        })
        return (
          <div>
            <Header count={shown().length} portfolio={loaded().live.portfolio()} />
            <label>
              Search
              <input type="search" value={text()} onInput={e => onSearch(e.currentTarget.value)} />
            </label>
            <label>
              Sort
              <select
                value={sort()}
                onChange={e => { const v = e.currentTarget.value === 'change' ? 'change' : 'symbol'; setSort(v); save('watchlist.sort', v) }}
              >
                <option value="symbol" selected={sort() === 'symbol'}>Symbol</option>
                <option value="change" selected={sort() === 'change'}>Change</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={favOnly()}
                onChange={e => { setFavOnly(e.currentTarget.checked); save('watchlist.favOnly', e.currentTarget.checked ? '1' : '0') }}
              />
              Favorites only
            </label>
            <For each={Object.values(favErrors())}>{msg => <p role="alert">{msg}</p>}</For>
            <Show when={pendingSearch()}>
              <p role="status">Searching…</p>
            </Show>
            <Show when={failed()}>
              <p role="alert">Search failed</p>
            </Show>
            <StockList stocks={shown()} live={loaded().live.byId} onToggle={toggle} onOpen={setOpenId} />
            <Show when={openId()} keyed>
              {id => {
                const stock = stocksById.get(id)! as Stock
                const note = createMemo(() => notes()[id] ?? '')
                return (
                  <DetailsPanel
                    api={props.api}
                    stock={stock}
                    live={loaded().live.byId.get(id)!}
                    note={note}
                    canUndo={() => undoStack().length > 0}
                    onSave={t => saveNote(id, t)}
                    onUndo={undoNote}
                    onClose={() => closePanel(id, stock.symbol)}
                  />
                )
              }}
            </Show>
          </div>
        )
      }}
    </Show>
  )
}
