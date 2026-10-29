import type { State } from 'weft'
import type { Stock } from '../api'
import type { Latest } from '../App'
import { StockRow } from './StockRow'

export function StockList({ stocks, quotes, favs, onToggle }: {
  stocks: Stock[]
  quotes: State<Record<string, Latest>>
  favs: State<Record<string, boolean>>
  onToggle: (id: string) => void
}) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => <StockRow key={s.id} stock={s} quotes={quotes} favs={favs} onToggle={onToggle} />)}
    </ul>
  )
}
