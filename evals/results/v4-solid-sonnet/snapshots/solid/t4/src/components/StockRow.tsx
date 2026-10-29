import { createMemo } from 'solid-js'
import type { Stock } from '../api'
import type { Live } from '../App'
import { money, pct, sparkline } from '../lib/format'

export function StockRow(props: { stock: Stock; live: Live; onFavorite: (s: Stock) => void; onOpen: (s: Stock, el: HTMLElement) => void }) {
  const price = createMemo(() => money(props.live.price()))
  const change = createMemo(() => pct(((props.live.price() - props.stock.prevClose) / props.stock.prevClose) * 100))
  const path = createMemo(() => sparkline(props.live.history()))
  return (
    <li>
      <span data-testid="symbol">
        <button type="button" aria-label={`Details ${props.stock.symbol}`} onClick={e => props.onOpen(props.stock, e.currentTarget)}>
          {props.stock.symbol}
        </button>
      </span>
      <span data-testid="name">{props.stock.name}</span>
      <span data-testid="price">{price()}</span>
      <span data-testid="change">{change()}</span>
      <button type="button" aria-label={`Favorite ${props.stock.symbol}`} aria-pressed={props.live.favorite() ? 'true' : 'false'} onClick={() => props.onFavorite(props.stock)}>
        {props.live.favorite() ? '★' : '☆'}
      </button>
      <svg data-testid="spark" width="60" height="16">
        <path d={path()} />
      </svg>
    </li>
  )
}
