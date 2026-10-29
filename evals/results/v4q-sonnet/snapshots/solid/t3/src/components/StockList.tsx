import { For } from 'solid-js'
import type { Stock } from '../api'
import type { Live } from '../quotes'
import { StockRow } from './StockRow'

export function StockList(props: { stocks: Stock[]; live: Map<string, Live>; onToggle: (id: string) => void }) {
  return (
    <ul aria-label="Stocks">
      <For each={props.stocks}>{s => <StockRow stock={s} live={props.live.get(s.id)!} onToggle={() => props.onToggle(s.id)} />}</For>
    </ul>
  )
}
