import type { State } from '@weft-js/core'
import type { Stock } from '../api'
import type { Live } from '../App'
import { StockRow } from './StockRow'

type Props = {
  stocks: Stock[]
  live: State<Record<string, Live>>
  favorites: State<Record<string, boolean>>
  onToggle: (stock: Stock) => void
  onDetails: (id: string, button: HTMLElement) => void
}

export function StockList({ stocks, live, favorites, onToggle, onDetails }: Props) {
  return (
    <ul aria-label="Stocks">
      {stocks.map((s) => (
        <StockRow
          key={s.id}
          stock={s}
          live={live.value[s.id]}
          favorite={!!favorites.value[s.id]}
          onToggle={onToggle}
          onDetails={onDetails}
        />
      ))}
    </ul>
  )
}
