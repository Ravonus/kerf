import type { State } from '@kerf/core'
import type { Stock } from '../api'
import type { Live } from '../App'
import { money, pct, sparkline } from '../lib/format'

type Props = {
  stock: Stock
  live: State<Record<string, Live>>
  favorites: State<Record<string, boolean>>
  onToggle: (stock: Stock) => void
  onDetails: (id: string, button: HTMLElement) => void
}

export function StockRow({ stock, live, favorites, onToggle, onDetails }: Props) {
  return (
    <li>
      <button
        data-testid="symbol"
        aria-label={`Details ${stock.symbol}`}
        onClick={(e) => onDetails(stock.id, e.currentTarget)}
      >
        {stock.symbol}
      </button>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{money(live.value[stock.id].price)}</span>
      <span data-testid="change">
        {pct(((live.value[stock.id].price - stock.prevClose) / stock.prevClose) * 100)}
      </span>
      <svg data-testid="spark" width="60" height="16">
        <path d={sparkline(live.value[stock.id].history)} />
      </svg>
      <button
        aria-label={`Favorite ${stock.symbol}`}
        aria-pressed={!!favorites.value[stock.id]}
        onClick={() => onToggle(stock)}
      >
        {favorites.value[stock.id] ? '★' : '☆'}
      </button>
    </li>
  )
}
