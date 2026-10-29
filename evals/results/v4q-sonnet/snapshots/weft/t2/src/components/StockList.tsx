import type { State } from 'weft'
import type { Stock } from '../api'
import type { LiveMap } from '../live'
import { StockRow } from './StockRow'

export function StockList({ stocks, live }: { stocks: Stock[]; live: State<LiveMap> }) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => <StockRow key={s.id} stock={s} live={live} />)}
    </ul>
  )
}
