import { memo, useCallback, useMemo, useSyncExternalStore } from 'react'
import { money, pct, sparkline } from '../lib/format'
import type { QuoteStore } from '../store'

export const StockRow = memo(function StockRow({ id, store, onToggle, onOpen }: { id: string; store: QuoteStore; onToggle: (id: string) => void; onOpen: (id: string) => void }) {
  const subscribe = useCallback((l: () => void) => store.subscribeRow(id, l), [store, id])
  const getSnapshot = useCallback(() => store.getRow(id), [store, id])
  const row = useSyncExternalStore(subscribe, getSnapshot)
  const { stock, price, history, favorite } = row
  const priceText = useMemo(() => money(price), [price])
  const changeText = useMemo(() => pct(((price - stock.prevClose) / stock.prevClose) * 100), [price, stock.prevClose])
  const path = useMemo(() => sparkline(history), [history])
  return (
    <li>
      <button type="button" data-testid="symbol" aria-label={`Details ${stock.symbol}`} onClick={() => onOpen(id)}>{stock.symbol}</button>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{priceText}</span>
      <span data-testid="change">{changeText}</span>
      <svg data-testid="spark" width="60" height="16"><path d={path} /></svg>
      <button type="button" aria-label={`Favorite ${stock.symbol}`} aria-pressed={favorite} onClick={() => onToggle(id)}>
        {favorite ? '★' : '☆'}
      </button>
    </li>
  )
})
