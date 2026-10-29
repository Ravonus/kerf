import { derived, type State } from 'weft'
import type { Quotes, Stock } from '../api'
import { money, pct, sparkline } from '../lib/format'

export function StockRow({ stock, quotes, favorites, onToggle, onOpen }: {
  stock: Stock
  quotes: State<Quotes>
  favorites: State<Record<string, boolean>>
  onToggle: (stock: Stock) => void
  onOpen: (stock: Stock, button: HTMLElement) => void
}) {
  // Each derived reads only this stock's entry, so a quote or a star click re-runs this row and no other.
  const quote = derived(() => quotes.get(stock.id))
  const favorite = derived(() => favorites.get(stock.id))
  return (
    <li>
      <button
        type="button"
        aria-label={`Favorite ${stock.symbol}`}
        aria-pressed={favorite.value ? 'true' : 'false'}
        onClick={() => onToggle(stock)}
      >
        {favorite.value ? '★' : '☆'}
      </button>
      <button type="button" aria-label={`Details ${stock.symbol}`} onClick={e => onOpen(stock, e.currentTarget)}>
        <span data-testid="symbol">{stock.symbol}</span>
      </button>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{money(quote.value.price)}</span>
      <span data-testid="change">{pct(((quote.value.price - stock.prevClose) / stock.prevClose) * 100)}</span>
      <svg data-testid="spark" width="60" height="16">
        <path d={sparkline(quote.value.history)} />
      </svg>
    </li>
  )
}
