import { state, watch, type State } from 'weft'
import type { Api, Stock } from '../api'
import type { LiveMap } from '../live'
import { money } from '../lib/format'
import { derived } from 'weft'

export function Details({ stock, api, live, draft, canUndo, onSave, onUndo, onClose }: {
  stock: Stock
  api: Api
  live: State<LiveMap>
  draft: State<string>
  canUndo: boolean
  onSave: () => void
  onUndo: () => void
  onClose: () => void
}) {
  const description = state<string | null>(null)
  const failed = state(false)
  const attempt = state(0)
  const price = derived(() => money(live.get(stock.id)?.price ?? stock.price))

  watch(() => `${stock.id}|${attempt.value}`, key => {
    const id = key.slice(0, key.lastIndexOf('|'))
    let alive = true
    description.value = null
    failed.value = false
    api.details(id).then(
      d => { if (alive) description.value = d.description },
      () => { if (alive) failed.value = true },
    )
    return () => { alive = false }
  })

  return (
    <section role="region" aria-label="Details" onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <h2>{stock.symbol} {stock.name}</h2>
      <p data-testid="detail-price">{price.value}</p>
      {description.value === null && !failed.value && <p>Loading…</p>}
      {description.value !== null && <p>{description.value}</p>}
      {failed.value && <p role="alert">Couldn't load details</p>}
      {failed.value && <button type="button" onClick={() => { attempt.value = attempt.value + 1 }}>Retry</button>}
      <label>
        Notes
        <textarea id="notes-field" value={draft.value} onInput={e => { draft.value = e.currentTarget.value }} />
      </label>
      <button type="button" onClick={onSave}>Save</button>
      <button type="button" disabled={!canUndo} onClick={onUndo}>Undo</button>
    </section>
  )
}
