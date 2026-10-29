import { For } from 'solid-js'
import type { Stock } from '../api'
import type { LiveState } from '../quotes'
import { StockRow } from './StockRow'

export function StockList(props: { stocks: Stock[]; live: LiveState }) {
  return (
    <ul aria-label="Stocks">
      <For each={props.stocks}>{s => <StockRow stock={s} live={props.live} />}</For>
    </ul>
  )
}
