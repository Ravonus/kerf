import { For } from 'solid-js'
import type { Stock } from '../api'
import type { Live } from '../App'
import { StockRow } from './StockRow'

export function StockList(props: { stocks: Stock[]; live: (id: string) => Live }) {
  return (
    <ul aria-label="Stocks">
      <For each={props.stocks}>{s => <StockRow stock={s} live={props.live(s.id)} />}</For>
    </ul>
  )
}
