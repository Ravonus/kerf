import { derived, type State } from 'weft'
import type { Stock } from '../api'
import type { LiveMap } from '../live'
import { money, pct, sparkline } from '../lib/format'

export function StockRow({ stock, live, favs, onToggle }: { stock: Stock; live: State<LiveMap>; favs: State<Record<string, boolean>>; onToggle: (id: string) => void }) {
  const price = derived(() => live.get(stock.id)?.price ?? stock.price)
  const history = derived(() => live.get(stock.id)?.history ?? [stock.price])
  const priceText = derived(() => money(price.value))
  const changeText = derived(() => pct(((price.value - stock.prevClose) / stock.prevClose) * 100))
  const path = derived(() => sparkline(history.value))
  return (
    <li>
      <button type="button" aria-label={`Favorite ${stock.symbol}`} aria-pressed={favs.get(stock.id) ? 'true' : 'false'} onClick={() => onToggle(stock.id)}>
        {favs.get(stock.id) ? '★' : '☆'}
      </button>
      <span data-testid="symbol">{stock.symbol}</span>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{priceText.value}</span>
      <span data-testid="change">{changeText.value}</span>
      <svg data-testid="spark" width="60" height="16"><path d={path.value} /></svg>
    </li>
  )
}
