import { For } from 'solid-js'
import type { Stock } from '../api'
import type { LiveFavorite } from '../lib/favorites'
import type { LiveQuote } from '../lib/live'
import { StockRow } from './StockRow'

export function StockList(props: {
  stocks: Stock[]
  quotes: Map<string, LiveQuote>
  favorites: Map<string, LiveFavorite>
  onToggle(stock: Stock): void
}) {
  return (
    <ul aria-label="Stocks">
      <For each={props.stocks}>
        {s => {
          // Resolved once per row, so a row's render does not depend on the list's props.
          const quote = props.quotes.get(s.id)!
          const favorite = props.favorites.get(s.id)!
          return <StockRow stock={s} quote={quote} favorite={favorite} onToggle={() => props.onToggle(s)} />
        }}
      </For>
    </ul>
  )
}
