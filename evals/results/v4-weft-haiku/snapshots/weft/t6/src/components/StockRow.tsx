import { derived, type State } from 'weft'
import type { Stock } from '../api'
import type { Latest } from '../App'
import { money, pct, sparkline } from '../lib/format'

/** Reads only this stock's entries, so a quote, a star click or a note for another stock never re-runs this row. */
export function StockRow({ stock, quotes, favs, onToggle, onOpen }: {
  stock: Stock
  quotes: State<Record<string, Latest>>
  favs: State<Record<string, boolean>>
  onToggle: (id: string) => void
  onOpen: (id: string) => void
}) {
  const latest = derived(() => quotes.get(stock.id) ?? { price: stock.price, history: [stock.price] })
  const fav = derived(() => favs.get(stock.id) ?? stock.favorite)
  return (
    <li>
      <button type="button" aria-label={`Favorite ${stock.symbol}`} aria-pressed={fav.value ? 'true' : 'false'} onClick={() => onToggle(stock.id)}>
        {fav.value ? '★' : '☆'}
      </button>
      <button type="button" id={`details-${stock.id}`} aria-label={`Details ${stock.symbol}`} data-testid="symbol" onClick={() => onOpen(stock.id)}>
        {stock.symbol}
      </button>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{money(latest.value.price)}</span>
      <span data-testid="change">{pct(((latest.value.price - stock.prevClose) / stock.prevClose) * 100)}</span>
      <svg data-testid="spark" width="60" height="16">
        <path d={sparkline(latest.value.history)} />
      </svg>
    </li>
  )
}
