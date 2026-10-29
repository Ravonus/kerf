import { memo } from 'react'
import type { QuoteStore } from '../store'
import { StockRow } from './StockRow'

export const StockList = memo(function StockList({ ids, store }: { ids: string[]; store: QuoteStore }) {
  return (
    <ul aria-label="Stocks">
      {ids.map(id => <StockRow key={id} id={id} store={store} />)}
    </ul>
  )
})
