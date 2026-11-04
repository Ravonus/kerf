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

export function StockRow(props: Props) {
  const { price, history } = props.live
  return (
    <li>
      <button
        data-testid="symbol"
        aria-label={`Details ${props.stock.symbol}`}
        onClick={(e) => props.onDetails(props.stock.id, e.currentTarget)}
      >
        {props.stock.symbol}
      </button>
      <span data-testid="name">{props.stock.name}</span>
      <span data-testid="price">{money(price)}</span>
      <span data-testid="change">
        {pct(((price - props.stock.prevClose) / props.stock.prevClose) * 100)}
      </span>
      <svg data-testid="spark" width="60" height="16">
        <path d={sparkline(history)} />
      </svg>
      <button
        aria-label={`Favorite ${props.stock.symbol}`}
        aria-pressed={props.favorite}
        onClick={() => props.onToggle(props.stock)}
      >
        {props.favorite ? '★' : '☆'}
      </button>
    </li>
  )
}
