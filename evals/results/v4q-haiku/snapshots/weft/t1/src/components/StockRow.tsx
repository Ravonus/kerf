import { derived, type State } from 'weft'
import type { Quotes, Stock } from '../api'
import { money, pct, sparkline } from '../lib/format'

export function StockRow({ stock, quotes }: { stock: Stock; quotes: State<Quotes> }) {
  // Reads only this stock's entry, so a quote re-runs this row and no other.
  const quote = derived(() => quotes.get(stock.id))
  return (
    <li>
      <span data-testid="symbol">{stock.symbol}</span>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{money(quote.value.price)}</span>
      <span data-testid="change">{pct(((quote.value.price - stock.prevClose) / stock.prevClose) * 100)}</span>
      <svg data-testid="spark" width="60" height="16">
        <path d={sparkline(quote.value.history)} />
      </svg>
    </li>
  )
}
