import type { Stock } from '../api'
import type { QuoteStore } from '../store'
import { StockRow } from './StockRow'

export function StockList({ stocks, store, favs, onToggle, onOpen }: { stocks: Stock[]; store: QuoteStore; favs: Record<string, boolean>; onToggle: (id: string) => void; onOpen: (id: string) => void }) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => <StockRow key={s.id} stock={s} store={store} favorite={favs[s.id] ?? s.favorite} onToggle={onToggle} onOpen={onOpen} />)}
    </ul>
  )
}
