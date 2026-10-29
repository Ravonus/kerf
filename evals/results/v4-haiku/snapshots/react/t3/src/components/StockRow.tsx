import { memo } from 'react'
import type { Api, Stock } from '../api'
import { money, pct, sparkline } from '../lib/format'
import { useEntry, type QuoteStore } from '../quotes'
import { FavoriteButton } from './FavoriteButton'

export const StockRow = memo(function StockRow({
  stock, store, api, onSaveError,
}: {
  stock: Stock
  store: QuoteStore
  api: Api
  onSaveError: (message: string | null) => void
}) {
  const { price, history } = useEntry(store, stock.id)
  return (
    <li>
      <span data-testid="symbol">{stock.symbol}</span>
      <span data-testid="name">{stock.name}</span>
      <span data-testid="price">{money(price)}</span>
      <span data-testid="change">{pct(((price - stock.prevClose) / stock.prevClose) * 100)}</span>
      <svg data-testid="spark" width="60" height="16"><path d={sparkline(history)} /></svg>
      <FavoriteButton id={stock.id} symbol={stock.symbol} store={store} api={api} onSaveError={onSaveError} />
    </li>
  )
})
