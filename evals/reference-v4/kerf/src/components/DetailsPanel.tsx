import { onMount, resource, state } from '@kerf-js/core'
import type { Api, Stock } from '../api'
import { money } from '../lib/format'

type Props = {
  api: Api
  stock: Stock
  price: number
  note: string
  canUndo: boolean
  onSave: (id: string, text: string) => void
  onUndo: () => void
  onClose: () => void
}

export function DetailsPanel({ api, stock, price, note, canUndo, onSave, onUndo, onClose }: Props) {
  const details = resource(() => api.details(stock.id))
  // The textarea's text: the saved note until the user types, and again whenever the saved note changes (an undo).
  const draft = state.linked(() => note)
  let notes!: HTMLTextAreaElement
  onMount(() => notes.focus())

  return (
    <section aria-label="Details" onKeyDown={(e) => e.key === 'Escape' && onClose()}>
      <h2>
        {stock.symbol} · {stock.name}
      </h2>
      <p data-testid="detail-price">{money(price)}</p>
      {details.pending ? (
        <p>Loading…</p>
      ) : details.error !== undefined ? (
        <>
          <p role="alert">Couldn't load details</p>
          <button onClick={() => details.refresh()}>Retry</button>
        </>
      ) : (
        <p>{details.value?.description}</p>
      )}
      <label>
        Notes{' '}
        <textarea
          ref={notes}
          value={draft.value}
          onInput={(e) => (draft.value = e.currentTarget.value)}
        />
      </label>
      <button onClick={() => onSave(stock.id, draft.value)}>Save</button>
      <button disabled={!canUndo} onClick={onUndo}>
        Undo
      </button>
    </section>
  )
}
