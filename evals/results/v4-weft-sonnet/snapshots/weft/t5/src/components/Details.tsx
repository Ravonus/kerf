import type { State } from 'weft'
import type { Stock } from '../api'
import { money } from '../lib/format'

export type Desc = { id: string; status: 'loading' | 'error' | 'ok'; text: string }

type Props = {
  stock: Stock
  prices: State<Record<string, number>>
  desc: State<Desc | null>
  draft: State<string>
  canUndo: boolean
  onSave: () => void
  onUndo: () => void
  onRetry: () => void
  onClose: () => void
}

export function Details({ stock, prices, desc, draft, canUndo, onSave, onUndo, onRetry, onClose }: Props) {
  const current = () => (desc.value && desc.value.id === stock.id ? desc.value : null)
  return (
    <section
      role="region"
      aria-label="Details"
      onKeyDown={e => { if (e.key === 'Escape') onClose() }}
    >
      <h2>{stock.symbol} {stock.name}</h2>
      <p data-testid="detail-price">{money(prices.get(stock.id) ?? stock.price)}</p>
      {(!current() || current()!.status === 'loading') && <p>Loading…</p>}
      {current()?.status === 'ok' && <p>{current()!.text}</p>}
      {current()?.status === 'error' && (
        <div>
          <p role="alert">Couldn't load details</p>
          <button onClick={() => onRetry()}>Retry</button>
        </div>
      )}
      <label>
        Notes
        <textarea value={draft.value} onInput={e => { draft.value = e.currentTarget.value }} />
      </label>
      <button onClick={() => onSave()}>Save</button>
      <button disabled={!canUndo} onClick={() => onUndo()}>Undo</button>
    </section>
  )
}
