import { derived, type State } from 'weft'
import type { Stock } from '../api'
import type { Latest } from '../App'
import { money, pct, sparkline } from '../lib/format'

/** Reads only this stock's entry, so a quote for another stock never re-runs this row. */
export function StockRow({ stock, quotes }: { stock: Stock; quotes: State<Record<string, Latest>> }) {
  const latest = derived(() => quotes.get(stock.id) ?? { price: stock.price, history: [stock.price] })
  return (
    <li>
      <span data-testid="symbol">{stock.symbol}</span>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{money(latest.value.price)}</span>
      <span data-testid="change">{pct(((latest.value.price - stock.prevClose) / stock.prevClose) * 100)}</span>
      <svg data-testid="spark" width="60" height="16">
        <path d={sparkline(latest.value.history)} />
      </svg>
    </li>
  )
}
