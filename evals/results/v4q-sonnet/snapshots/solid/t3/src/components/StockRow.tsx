import { createMemo } from 'solid-js'
import type { Stock } from '../api'
import type { Live } from '../quotes'
import { money, pct, sparkline } from '../lib/format'

export function StockRow(props: { stock: Stock; live: Live; onToggle: () => void }) {
  const price = createMemo(() => money(props.live.price()))
  const change = createMemo(() => pct(((props.live.price() - props.stock.prevClose) / props.stock.prevClose) * 100))
  const path = createMemo(() => sparkline(props.live.history()))
  return (
    <li>
      <span data-testid="symbol">{props.stock.symbol}</span>
      <span data-testid="name">{props.stock.name}</span>
      <span data-testid="price">{price()}</span>
      <span data-testid="change">{change()}</span>
      <button type="button" aria-label={`Favorite ${props.stock.symbol}`} aria-pressed={props.live.favorite()} onClick={() => props.onToggle()}>
        {props.live.favorite() ? '★' : '☆'}
      </button>
      <svg data-testid="spark" width="60" height="16">
        <path d={path()} />
      </svg>
    </li>
  )
}
