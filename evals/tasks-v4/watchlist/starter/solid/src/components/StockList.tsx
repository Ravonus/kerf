import { For } from 'solid-js'
import type { Stock } from '../api'
import { StockRow } from './StockRow'

export function StockList(props: { stocks: Stock[] }) {
  return (
    <ul aria-label="Stocks">
      <For each={props.stocks}>{(s) => <StockRow stock={s} />}</For>
    </ul>
  )
}
