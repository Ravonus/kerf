import { useEffect, useRef, useState } from 'react'
import type { Api, Stock } from '../api'
import { money } from '../lib/format'
import { useQuote } from '../quotes'

type Load = { status: 'loading' } | { status: 'ok'; description: string } | { status: 'error' }

/** Mounted with `key={stock.id}`, so switching stocks resets its state and drops late descriptions. */
export function DetailsPanel({
  api,
  stock,
  note,
  canUndo,
  focusToken,
  onSave,
  onUndo,
  onClose,
}: {
  api: Api
  stock: Stock
  note: string
  canUndo: boolean
  /** Changes each time the panel is opened; a change moves focus to the Notes textarea. */
  focusToken: number
  onSave: (text: string) => void
  onUndo: () => void
  onClose: () => void
}) {
  const quote = useQuote(stock.id)
  const price = quote?.price ?? stock.price
  const [attempt, setAttempt] = useState(0)
  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [draft, setDraft] = useState(note)
  const notes = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let live = true
    setLoad({ status: 'loading' })
    api.details(stock.id).then(
      d => { if (live) setLoad({ status: 'ok', description: d.description }) },
      () => { if (live) setLoad({ status: 'error' }) },
    )
    return () => { live = false }
  }, [api, stock.id, attempt])

  // An undo (or save) of this stock's note replaces what the textarea shows.
  useEffect(() => { setDraft(note) }, [note])

  useEffect(() => { notes.current?.focus() }, [focusToken])

  return (
    <section role="region" aria-label="Details" onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <h2>{`${stock.symbol} ${stock.name}`}</h2>
      <p data-testid="detail-price">{money(price)}</p>
      {load.status === 'loading' && <p>Loading…</p>}
      {load.status === 'ok' && <p>{load.description}</p>}
      {load.status === 'error' && (
        <>
          <p role="alert">Couldn't load details</p>
          <button type="button" onClick={() => setAttempt(a => a + 1)}>Retry</button>
        </>
      )}
      <label htmlFor="notes">Notes</label>
      <textarea id="notes" ref={notes} value={draft} onChange={e => setDraft(e.target.value)} />
      <button type="button" onClick={() => onSave(draft)}>Save</button>
      <button type="button" onClick={onUndo} disabled={!canUndo}>Undo</button>
    </section>
  )
}
