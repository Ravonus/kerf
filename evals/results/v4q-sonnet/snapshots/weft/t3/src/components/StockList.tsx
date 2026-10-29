import type { State } from 'weft'
import type { Stock } from '../api'
import type { LiveMap } from '../live'
import { StockRow } from './StockRow'

export function StockList({ stocks, live, favs, onToggle }: { stocks: Stock[]; live: State<LiveMap>; favs: State<Record<string, boolean>>; onToggle: (id: string) => void }) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => <StockRow key={s.id} stock={s} live={live} favs={favs} onToggle={onToggle} />)}
    </ul>
  )
}
