import type { Stock } from '../api'
import { StockRow } from './StockRow'

export function StockList({
  stocks,
  favorites,
  onToggleFavorite,
}: {
  stocks: Stock[]
  favorites: Record<string, boolean>
  onToggleFavorite: (stock: Stock) => void
}) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => (
        <StockRow key={s.id} stock={s} favorite={favorites[s.id]} onToggleFavorite={onToggleFavorite} />
      ))}
    </ul>
  )
}
