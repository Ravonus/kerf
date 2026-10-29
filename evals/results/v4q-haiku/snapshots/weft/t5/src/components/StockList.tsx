import type { State } from 'weft'
import type { Quotes, Stock } from '../api'
import { StockRow } from './StockRow'

export function StockList({ stocks, quotes, favorites, onToggle, onOpen }: {
  stocks: Stock[]
  quotes: State<Quotes>
  favorites: State<Record<string, boolean>>
  onToggle: (stock: Stock) => void
  onOpen: (stock: Stock, button: HTMLElement) => void
}) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => <StockRow key={s.id} stock={s} quotes={quotes} favorites={favorites} onToggle={onToggle} onOpen={onOpen} />)}
    </ul>
  )
}
