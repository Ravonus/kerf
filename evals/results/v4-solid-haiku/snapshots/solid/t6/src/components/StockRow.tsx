import { createMemo } from 'solid-js'
import type { Stock } from '../api'
import { money, pct, sparkline } from '../lib/format'
import type { LiveFavorite } from '../lib/favorites'
import type { LiveQuote } from '../lib/live'

export function StockRow(props: {
  stock: Stock
  quote: LiveQuote
  favorite: LiveFavorite
  onToggle(): void
  onDetails(button: HTMLButtonElement): void
}) {
  // Each formatted value is a memo, so a formatter runs only when its own input changes, not whenever
  // another binding in this row re-runs.
  const price = createMemo(() => money(props.quote.price()))
  const change = createMemo(() => pct(((props.quote.price() - props.stock.prevClose) / props.stock.prevClose) * 100))
  const spark = createMemo(() => sparkline(props.quote.history()))
  let detailsButton!: HTMLButtonElement

  return (
    <li>
      <button
        type="button"
        aria-label={`Favorite ${props.stock.symbol}`}
        aria-pressed={props.favorite.favorite() ? 'true' : 'false'}
        onClick={() => props.onToggle()}
      >
        {props.favorite.favorite() ? '★' : '☆'}
      </button>
      <button
        ref={detailsButton}
        type="button"
        aria-label={`Details ${props.stock.symbol}`}
        onClick={() => props.onDetails(detailsButton)}
      >
        <span data-testid="symbol">{props.stock.symbol}</span>
      </button>
      <span data-testid="name">{props.stock.name}</span>
      <span data-testid="price">{price()}</span>
      <span data-testid="change">{change()}</span>
      <svg data-testid="spark" width="60" height="16">
        <path d={spark()} />
      </svg>
    </li>
  )
}
