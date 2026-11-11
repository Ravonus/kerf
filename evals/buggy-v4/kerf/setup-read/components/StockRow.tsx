import { derived, type State } from '@kerf-js/core'
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
  // This row's entries only: a quote or a star for another stock doesn't re-run it (W017).
  const quote = live.get(stock.id)
  const favorite = derived(() => !!favorites.get(stock.id))
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
      <span data-testid="price">{money(quote.price)}</span>
      <span data-testid="change">
        {pct(((quote.price - stock.prevClose) / stock.prevClose) * 100)}
      </span>
      <svg data-testid="spark" width="60" height="16">
        <path d={sparkline(quote.history)} />
      </svg>
      <button
        aria-label={`Favorite ${stock.symbol}`}
        aria-pressed={favorite.value}
        onClick={() => onToggle(stock)}
      >
        {favorite.value ? '★' : '☆'}
      </button>
    </li>
  )
}
