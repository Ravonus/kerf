
import type { Stock } from '../api'
import type { Live } from '../App'
import { money, pct, sparkline } from '../lib/format'

type Props = {
  stock: Stock
  live: Live
  favorite: boolean
  onToggle: (stock: Stock) => void
  onDetails: (id: string, button: HTMLElement) => void
}

export function StockRow({ stock, live, favorite, onToggle, onDetails }: Props) {
  return (
    <li>
      <button data-testid="symbol" aria-label={`Details ${stock.symbol}`} onClick={e => onDetails(stock.id, e.currentTarget)}>
        {stock.symbol}
      </button>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{money(live.price)}</span>
      <span data-testid="change">{pct(((live.price - stock.prevClose) / stock.prevClose) * 100)}</span>
      <svg data-testid="spark" width="60" height="16"><path d={sparkline(live.history)} /></svg>
      <button aria-label={`Favorite ${stock.symbol}`} aria-pressed={favorite} onClick={() => onToggle(stock)}>
        {favorite ? '★' : '☆'}
      </button>
    </li>
  )
}
