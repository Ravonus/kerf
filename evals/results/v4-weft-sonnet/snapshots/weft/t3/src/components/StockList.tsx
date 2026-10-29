import type { State } from 'weft'
import type { Stock } from '../api'
import { StockRow } from './StockRow'

export function StockList({ stocks, prices, histories, favs, onToggle }: { stocks: Stock[]; prices: State<Record<string, number>>; histories: State<Record<string, number[]>>; favs: State<Record<string, boolean>>; onToggle: (stock: Stock) => void }) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => <StockRow key={s.id} stock={s} prices={prices} histories={histories} favs={favs} onToggle={onToggle} />)}
    </ul>
  )
}
