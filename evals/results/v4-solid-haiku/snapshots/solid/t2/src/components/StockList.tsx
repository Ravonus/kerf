import { For } from 'solid-js'
import type { Stock } from '../api'
import type { LiveQuote } from '../lib/live'
import { StockRow } from './StockRow'

export function StockList(props: { stocks: Stock[]; quotes: Map<string, LiveQuote> }) {
  return (
    <ul aria-label="Stocks">
      <For each={props.stocks}>{s => <StockRow stock={s} quote={props.quotes.get(s.id)!} />}</For>
    </ul>
  )
}
