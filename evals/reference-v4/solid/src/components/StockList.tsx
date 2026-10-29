import { For } from 'solid-js'
import type { Stock } from '../api'
import type { Live } from '../App'
import { StockRow } from './StockRow'

type Props = {
  stocks: Stock[]
  live: Record<string, Live>
  favorites: Record<string, boolean>
  onToggle: (stock: Stock) => void
  onDetails: (id: string, button: HTMLElement) => void
}

export function StockList(props: Props) {
  return (
    <ul aria-label="Stocks">
      <For each={props.stocks}>
        {s => (
          <StockRow
            stock={s}
            live={props.live[s.id]}
            favorite={!!props.favorites[s.id]}
            onToggle={props.onToggle}
            onDetails={props.onDetails}
          />
        )}
      </For>
    </ul>
  )
}
