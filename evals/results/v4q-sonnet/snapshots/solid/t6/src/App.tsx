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

  const load = (k: string) => { try { return localStorage.getItem(k) } catch { return null } }
  const save = (k: string, v: string) => { try { localStorage.setItem(k, v) } catch {} }
  const [favErrors, setFavErrors] = createSignal<Record<string, string>>({})

  // Per-tab settings (search text, favorites only, sort) and per-tab search state.
  const TABS = ['All', 'tech', 'energy', 'health', 'finance'] as const
  type Tab = (typeof TABS)[number]
  type Saved = Record<string, { text?: string; sort?: string; favOnly?: boolean }>
  let savedTabs: Saved = {}
  try { savedTabs = JSON.parse(load('watchlist.tabs') ?? '{}') ?? {} } catch {}
  const savedTab = load('watchlist.tab')
  const [tab, setTab] = createSignal<Tab>((TABS as readonly string[]).includes(savedTab ?? '') ? (savedTab as Tab) : 'All')

  function makeTab(name: Tab) {
    const sv = savedTabs[name] ?? {}
    const [text, setText] = createSignal(typeof sv.text === 'string' ? sv.text : '')
    const [sort, setSort] = createSignal<'symbol' | 'change'>(sv.sort === 'change' ? 'change' : 'symbol')
    const [favOnly, setFavOnly] = createSignal(sv.favOnly === true)
    const [matches, setMatches] = createSignal<Set<string> | null>(null)
    const [pending, setPending] = createSignal(false)
    const [failed, setFailed] = createSignal(false)
    return { text, setText, sort, setSort, favOnly, setFavOnly, matches, setMatches, pending, setPending, failed, setFailed,
      controller: undefined as AbortController | undefined, current: '', started: false }
  }
  const tabs = Object.fromEntries(TABS.map(t => [t, makeTab(t)])) as Record<Tab, ReturnType<typeof makeTab>>
  onCleanup(() => TABS.forEach(t => tabs[t].controller?.abort()))

  function persist() {
    const out: Saved = {}
    for (const t of TABS) out[t] = { text: tabs[t].text(), sort: tabs[t].sort(), favOnly: tabs[t].favOnly() }
    save('watchlist.tabs', JSON.stringify(out))
  }

  // Only the latest query of each tab is ever applied; other tabs' searches keep running.
  function runSearch(t: Tab, value: string) {
    const st = tabs[t]
    const q = value.trim()
    if (q === st.current) return
    st.current = q
    st.controller?.abort()
    st.controller = undefined
    if (q === '') {
      st.setMatches(null)
      st.setPending(false)
      st.setFailed(false)
      return
    }
    const mine = (st.controller = new AbortController())
    st.setPending(true)
    props.api.search(q, mine.signal).then(
      ids => {
        if (st.controller !== mine) return
        st.setMatches(new Set(ids))
        st.setFailed(false)
        st.setPending(false)
      },
      () => {
        if (st.controller !== mine) return
        st.setFailed(true)
        st.setPending(false)
      },
    )
  }
  function onSearch(value: string) {
    const t = tab()
    tabs[t].setText(value)
    persist()
    tabs[t].started = true
    runSearch(t, value)
  }
  // A tab's restored search runs when the tab is first shown.
  function showTab(t: Tab) {
    setTab(t)
    save('watchlist.tab', t)
    if (!tabs[t].started) {
      tabs[t].started = true
      runSearch(t, tabs[t].text())
    }
  }
  showTab(tab())

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
        const cur = () => tabs[tab()]
        const shown = createMemo(() => {
          const st = cur()
          const m = st.matches()
          const fo = st.favOnly()
          const sector = tab()
          const byId = loaded().live.byId
          const base = sector === 'All' ? loaded().stocks : loaded().stocks.filter(s => s.sector === sector)
          const filtered = m || fo ? base.filter(s => (!m || m.has(s.id)) && (!fo || byId.get(s.id)!.favorite())) : base
          if (st.sort() !== 'change') return filtered
          const keyed = filtered.map((s, i) => ({ s, i, c: (byId.get(s.id)!.price() - s.prevClose) / s.prevClose }))
          keyed.sort((a, b) => b.c - a.c || a.i - b.i)
          return keyed.map(k => k.s)
        })
        return (
          <div>
            <Header count={shown().length} portfolio={loaded().live.portfolio()} />
            <div>
              <For each={TABS}>
                {t => (
                  <button type="button" aria-pressed={tab() === t} onClick={() => showTab(t)}>
                    {t}
                  </button>
                )}
              </For>
            </div>
            <label>
              Search
              <input type="search" value={cur().text()} onInput={e => onSearch(e.currentTarget.value)} />
            </label>
            <label>
              Sort
              <select
                value={cur().sort()}
                onChange={e => { cur().setSort(e.currentTarget.value === 'change' ? 'change' : 'symbol'); persist() }}
              >
                <option value="symbol" selected={cur().sort() === 'symbol'}>Symbol</option>
                <option value="change" selected={cur().sort() === 'change'}>Change</option>
              </select>
            </label>
            <label>
              <input
                type="checkbox"
                checked={cur().favOnly()}
                onChange={e => { cur().setFavOnly(e.currentTarget.checked); persist() }}
              />
              Favorites only
            </label>
            <For each={Object.values(favErrors())}>{msg => <p role="alert">{msg}</p>}</For>
            <Show when={cur().pending()}>
              <p role="status">Searching…</p>
            </Show>
            <Show when={cur().failed()}>
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
