import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Api } from '../api'
import { money } from '../lib/format'
import type { NotesStore } from '../notes'
import { useEntry, type QuoteStore } from '../quotes'

type Description = { status: 'loading' } | { status: 'ok'; text: string } | { status: 'error' }

/** Remounted (keyed by id) for each stock, so a late description for an earlier stock never reaches this panel. */
export function DetailsPanel({ id, store, api, notes, onClose }: {
  id: string
  store: QuoteStore
  api: Api
  notes: NotesStore
  onClose: () => void
}) {
  const stock = store.stock(id)
  const { price } = useEntry(store, id)
  const priceText = useMemo(() => money(price), [price])
  const noteState = useSyncExternalStore(notes.subscribe, notes.snapshot)
  const [draft, setDraft] = useState(() => noteState.notes.get(id) ?? '')
  const [description, setDescription] = useState<Description>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  const notesBox = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    notesBox.current?.focus()
  }, [])

  useEffect(() => {
    let live = true
    setDescription({ status: 'loading' })
    api.details(id).then(
      d => { if (live) setDescription({ status: 'ok', text: d.description }) },
      () => { if (live) setDescription({ status: 'error' }) },
    )
    return () => { live = false }
  }, [api, id, attempt])

  const onUndo = () => {
    const undone = notes.undo()
    if (undone && undone.id === id) setDraft(undone.text)
  }

  return (
    <section role="region" aria-label="Details" onKeyDown={e => { if (e.key === 'Escape') onClose() }}>
      <h2>{stock.symbol} {stock.name}</h2>
      <p data-testid="detail-price">{priceText}</p>
      {description.status === 'loading' && <p>Loading…</p>}
      {description.status === 'ok' && <p>{description.text}</p>}
      {description.status === 'error' && (
        <>
          <p role="alert">Couldn't load details</p>
          <button type="button" onClick={() => setAttempt(a => a + 1)}>Retry</button>
        </>
      )}
      <label>
        Notes <textarea ref={notesBox} value={draft} onChange={e => setDraft(e.target.value)} />
      </label>
      <button type="button" onClick={() => notes.save(id, draft)}>Save</button>
      <button type="button" disabled={noteState.undo.length === 0} onClick={onUndo}>Undo</button>
    </section>
  )
}
