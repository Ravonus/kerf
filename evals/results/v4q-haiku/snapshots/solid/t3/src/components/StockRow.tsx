import { createMemo } from 'solid-js'
import type { Stock } from '../api'
import { money, pct, sparkline } from '../lib/format'
import type { LiveState } from '../quotes'

export function StockRow(props: {
  stock: Stock
  live: LiveState
  favs: Record<string, boolean>
  onToggle: (stock: Stock) => void
}) {
  const entry = () => props.live[props.stock.id]
  // Each formatted value is memoized on its own input, so a quote re-formats only this row's cells.
  const price = createMemo(() => money(entry().price))
  const change = createMemo(() => pct(((entry().price - props.stock.prevClose) / props.stock.prevClose) * 100))
  const spark = createMemo(() => sparkline(entry().history))
  const fav = () => props.favs[props.stock.id]
  return (
    <li>
      <button
        type="button"
        aria-label={`Favorite ${props.stock.symbol}`}
        aria-pressed={fav()}
        onClick={() => props.onToggle(props.stock)}
      >
        {fav() ? '★' : '☆'}
      </button>
      <span data-testid="symbol">{props.stock.symbol}</span>
      <span data-testid="name">{props.stock.name}</span>
      <span data-testid="price">{price()}</span>
      <span data-testid="change">{change()}</span>
      <svg data-testid="spark" width="60" height="16">
        <path d={spark()} />
      </svg>
    </li>
  )
}
