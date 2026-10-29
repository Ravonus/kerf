import type { State } from 'weft'
import type { Stock } from '../api'
import { StockRow } from './StockRow'

export function StockList({ stocks, prices, histories }: { stocks: Stock[]; prices: State<Record<string, number>>; histories: State<Record<string, number[]>> }) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => <StockRow key={s.id} stock={s} prices={prices} histories={histories} />)}
    </ul>
  )
}
