import { onMount, type Derived, type State } from 'weft'
import type { Stock } from '../api'
import { money } from '../lib/format'

/** What the panel shows and does. The boxes come from App; the panel only reads them and calls the actions. */
export type Details = {
  stock: Derived<Stock | undefined>
  price: Derived<number | undefined>
  view: Derived<{ status: 'loading' | 'ok' | 'error'; text: string }>
  draft: State<string>
  canUndo: Derived<boolean>
  save: () => void
  undo: () => void
  retry: () => void
  close: () => void
}

export function DetailsPanel({ d }: { d: Details }) {
  // Opening the panel moves focus to its Notes box.
  onMount(() => document.getElementById('details-notes')?.focus())
  return (
    <section role="region" aria-label="Details" onKeyDown={e => { if (e.key === 'Escape') d.close() }}>
      <h2>{d.stock.value?.symbol} {d.stock.value?.name}</h2>
      <p data-testid="detail-price">{money(d.price.value ?? 0)}</p>
      {d.view.value.status === 'loading' && <p>Loading…</p>}
      {d.view.value.status === 'error' && <p role="alert">Couldn't load details</p>}
      {d.view.value.status === 'error' && <button type="button" onClick={d.retry}>Retry</button>}
      {d.view.value.status === 'ok' && <p>{d.view.value.text}</p>}
      <label>
        Notes <textarea id="details-notes" value={d.draft.value} onInput={e => (d.draft.value = e.currentTarget.value)} />
      </label>
      <button type="button" onClick={d.save}>Save</button>
      <button type="button" onClick={d.undo} disabled={!d.canUndo.value}>Undo</button>
    </section>
  )
}
