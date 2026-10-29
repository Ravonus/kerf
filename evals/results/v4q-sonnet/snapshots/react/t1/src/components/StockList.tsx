import type { Stock } from '../api'
import type { QuoteStore } from '../store'
import { StockRow } from './StockRow'

export function StockList({ stocks, store }: { stocks: Stock[]; store: QuoteStore }) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => <StockRow key={s.id} stock={s} store={store} />)}
    </ul>
  )
}
