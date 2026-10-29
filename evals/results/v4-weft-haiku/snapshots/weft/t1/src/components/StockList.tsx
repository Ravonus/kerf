import type { State } from 'weft'
import type { Stock } from '../api'
import type { Latest } from '../App'
import { StockRow } from './StockRow'

export function StockList({ stocks, quotes }: { stocks: Stock[]; quotes: State<Record<string, Latest>> }) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => <StockRow key={s.id} stock={s} quotes={quotes} />)}
    </ul>
  )
}
