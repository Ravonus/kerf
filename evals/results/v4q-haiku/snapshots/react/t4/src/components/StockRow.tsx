import { memo } from 'react'
import type { Stock } from '../api'
import { money, pct, sparkline } from '../lib/format'
import { useQuote } from '../quotes'

export const StockRow = memo(function StockRow({
  stock,
  favorite,
  onToggleFavorite,
  onOpenDetails,
}: {
  stock: Stock
  favorite: boolean
  onToggleFavorite: (stock: Stock) => void
  onOpenDetails: (stock: Stock, opener: HTMLButtonElement) => void
}) {
  const quote = useQuote(stock.id)
  const price = quote?.price ?? stock.price
  const history = quote?.history ?? [stock.price]
  return (
    <li>
      <button type="button" aria-label={`Favorite ${stock.symbol}`} aria-pressed={favorite} onClick={() => onToggleFavorite(stock)}>
        {favorite ? '★' : '☆'}
      </button>
      <button
        type="button"
        data-testid="symbol"
        aria-label={`Details ${stock.symbol}`}
        onClick={e => onOpenDetails(stock, e.currentTarget)}
      >
        {stock.symbol}
      </button>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{money(price)}</span>
      <span data-testid="change">{pct(((price - stock.prevClose) / stock.prevClose) * 100)}</span>
      <svg data-testid="spark" width="60" height="16">
        <path d={sparkline(history)} />
      </svg>
    </li>
  )
})
