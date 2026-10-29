import { useEffect, useMemo, useRef, useState } from 'react'
import type { Api } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { QuoteStore } from './store'

export function App({ api }: { api: Api }) {
  const store = useMemo(() => new QuoteStore(), [api])
  const [ids, setIds] = useState<string[] | null>(null)
  const [query, setQuery] = useState('')
  const [matches, setMatches] = useState<Set<string> | null>(null) // null = show everything
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const latest = useRef<{ q: string; ctrl: AbortController } | null>(null)

  useEffect(() => {
    let live = true
    const unsubscribe = api.subscribeQuotes(q => store.push(q))
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      store.load(list, holdings)
      setIds(list.map(s => s.id))
    })
    return () => { live = false; unsubscribe(); latest.current?.ctrl.abort(); latest.current = null }
  }, [api, store])

  const shown = useMemo(() => (ids && matches ? ids.filter(id => matches.has(id)) : ids), [ids, matches])

  function onChange(text: string) {
    setQuery(text)
    const q = text.trim()
    if (latest.current?.q === q) return
    latest.current?.ctrl.abort()
    if (!q) {
      latest.current = null
      setMatches(null)
      setPending(false)
      setFailed(false)
      return
    }
    const ctrl = new AbortController()
    const mine = { q, ctrl }
    latest.current = mine
    setPending(true)
    api.search(q, ctrl.signal).then(
      result => {
        if (latest.current !== mine) return
        setMatches(new Set(result))
        setPending(false)
        setFailed(false)
      },
      () => {
        if (latest.current !== mine) return
        setPending(false)
        setFailed(true)
      },
    )
  }

  if (!ids || !shown) return <p>Loading…</p>
  return (
    <div>
      <Header count={shown.length} store={store} />
      <label>
        Search
        <input type="search" value={query} onChange={e => onChange(e.target.value)} />
      </label>
      {pending && <p role="status">Searching…</p>}
      {failed && <p role="alert">Search failed</p>}
      <StockList ids={shown} store={store} />
    </div>
  )
}
