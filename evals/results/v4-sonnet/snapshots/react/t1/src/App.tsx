import { useEffect, useMemo, useState } from 'react'
import type { Api } from './api'
import { Header } from './components/Header'
import { StockList } from './components/StockList'
import { QuoteStore } from './store'

export function App({ api }: { api: Api }) {
  const store = useMemo(() => new QuoteStore(), [api])
  const [ids, setIds] = useState<string[] | null>(null)

  useEffect(() => {
    let live = true
    const unsubscribe = api.subscribeQuotes(q => store.push(q))
    Promise.all([api.listStocks(), api.listHoldings()]).then(([list, holdings]) => {
      if (!live) return
      store.load(list, holdings)
      setIds(list.map(s => s.id))
    })
    return () => { live = false; unsubscribe() }
  }, [api, store])

  if (!ids) return <p>Loading…</p>
  return (
    <div>
      <Header count={ids.length} store={store} />
      <StockList ids={ids} store={store} />
    </div>
  )
}
