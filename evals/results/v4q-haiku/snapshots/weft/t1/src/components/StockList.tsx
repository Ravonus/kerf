import type { State } from 'weft'
import type { Quotes, Stock } from '../api'
import { StockRow } from './StockRow'

export function StockList({ stocks, quotes }: { stocks: Stock[]; quotes: State<Quotes> }) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => <StockRow key={s.id} stock={s} quotes={quotes} />)}
    </ul>
  )
}
