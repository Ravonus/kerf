import type { Api, Stock } from '../api'
import type { QuoteStore } from '../quotes'
import { StockRow } from './StockRow'

export function StockList({ stocks, store, api, onSaveError }: {
  stocks: Stock[]
  store: QuoteStore
  api: Api
  onSaveError: (message: string | null) => void
}) {
  return (
    <ul aria-label="Stocks">
      {stocks.map(s => <StockRow key={s.id} stock={s} store={store} api={api} onSaveError={onSaveError} />)}
    </ul>
  )
}
