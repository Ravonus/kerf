import type { Stock } from '../api'
import { money, pct } from '../lib/format'

export function StockRow({ stock }: { stock: Stock }) {
  return (
    <li>
      <span data-testid="symbol">{stock.symbol}</span>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{money(stock.price)}</span>
      <span data-testid="change">{pct(((stock.price - stock.prevClose) / stock.prevClose) * 100)}</span>
    </li>
  )
}
