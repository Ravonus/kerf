import { For } from 'solid-js'
import type { Stock } from '../api'
import type { LiveState } from '../quotes'
import { StockRow } from './StockRow'

export function StockList(props: {
  stocks: Stock[]
  live: LiveState
  favs: Record<string, boolean>
  onToggle: (stock: Stock) => void
}) {
  return (
    <ul aria-label="Stocks">
      <For each={props.stocks}>
        {s => <StockRow stock={s} live={props.live} favs={props.favs} onToggle={props.onToggle} />}
      </For>
    </ul>
  )
}
