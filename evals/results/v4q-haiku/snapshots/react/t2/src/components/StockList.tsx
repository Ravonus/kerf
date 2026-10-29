import type { Stock } from '../api'
import { StockRow } from './StockRow'

export function StockList({ stocks }: { stocks: Stock[] }) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => <StockRow key={s.id} stock={s} />)}
    </ul>
  )
}
