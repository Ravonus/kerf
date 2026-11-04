import type { Stock } from '../api'
import { money, pct } from '../lib/format'

export function StockRow(props: { stock: Stock }) {
  return (
    <li>
      <span data-testid="symbol">{props.stock.symbol}</span>
      <span data-testid="name">{props.stock.name}</span>
      <span data-testid="price">{money(props.stock.price)}</span>
      <span data-testid="change">
        {pct(((props.stock.price - props.stock.prevClose) / props.stock.prevClose) * 100)}
      </span>
    </li>
  )
}
