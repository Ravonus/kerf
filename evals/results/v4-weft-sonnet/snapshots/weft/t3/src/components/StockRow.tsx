import type { State } from 'weft'
import type { Stock } from '../api'
import { money, pct, sparkline } from '../lib/format'

export function StockRow({ stock, prices, histories, favs, onToggle }: { stock: Stock; prices: State<Record<string, number>>; histories: State<Record<string, number[]>>; favs: State<Record<string, boolean>>; onToggle: (stock: Stock) => void }) {
  return (
    <li>
      <span data-testid="symbol">{stock.symbol}</span>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{money(prices.get(stock.id) ?? stock.price)}</span>
      <span data-testid="change">{pct((((prices.get(stock.id) ?? stock.price) - stock.prevClose) / stock.prevClose) * 100)}</span>
      <svg data-testid="spark" width="60" height="16"><path d={sparkline(histories.get(stock.id) ?? [stock.price])} /></svg>
      <button aria-label={`Favorite ${stock.symbol}`} aria-pressed={favs.get(stock.id) ? 'true' : 'false'} onClick={() => onToggle(stock)}>{favs.get(stock.id) ? '★' : '☆'}</button>
    </li>
  )
}
