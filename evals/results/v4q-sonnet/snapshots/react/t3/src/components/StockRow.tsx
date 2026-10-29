import { memo, useCallback, useMemo, useSyncExternalStore } from 'react'
import type { Stock } from '../api'
import { money, pct, sparkline } from '../lib/format'
import type { QuoteStore } from '../store'

export const StockRow = memo(function StockRow({ stock, store, favorite, onToggle }: { stock: Stock; store: QuoteStore; favorite: boolean; onToggle: (id: string) => void }) {
  const subscribe = useCallback((l: () => void) => store.subscribeRow(stock.id, l), [store, stock.id])
  const history = useSyncExternalStore(subscribe, () => store.getHistory(stock.id))
  const price = history[history.length - 1] ?? stock.price
  const priceText = useMemo(() => money(price), [price])
  const changeText = useMemo(() => pct(((price - stock.prevClose) / stock.prevClose) * 100), [price, stock.prevClose])
  const path = useMemo(() => sparkline(history), [history])
  return (
    <li>
      <button type="button" aria-pressed={favorite} aria-label={`Favorite ${stock.symbol}`} onClick={() => onToggle(stock.id)}>
        {favorite ? '★' : '☆'}
      </button>
      <span data-testid="symbol">{stock.symbol}</span>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{priceText}</span>
      <span data-testid="change">{changeText}</span>
      <svg data-testid="spark" width="60" height="16"><path d={path} /></svg>
    </li>
  )
})
