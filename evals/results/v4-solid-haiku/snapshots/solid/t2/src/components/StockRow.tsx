import type { Stock } from '../api'
import type { LiveQuote } from '../lib/live'
import { money, pct, sparkline } from '../lib/format'

export function StockRow(props: { stock: Stock; quote: LiveQuote }) {
  return (
    <li>
      <span data-testid="symbol">{props.stock.symbol}</span>
      <span data-testid="name">{props.stock.name}</span>
      <span data-testid="price">{money(props.quote.price())}</span>
      <span data-testid="change">{pct(((props.quote.price() - props.stock.prevClose) / props.stock.prevClose) * 100)}</span>
      <svg data-testid="spark" width="60" height="16">
        <path d={sparkline(props.quote.history())} />
      </svg>
    </li>
  )
}
