import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { Api, Stock } from '../api'
import { money } from '../lib/format'
import type { QuoteStore } from '../store'

type Load = { status: 'loading' } | { status: 'error' } | { status: 'ok'; description: string }

export function DetailsPanel({ api, stock, store, note, canUndo, onSave, onUndo, onClose }: {
  api: Api
  stock: Stock
  store: QuoteStore
  note: string
  canUndo: boolean
  onSave: (id: string, note: string) => void
  onUndo: () => void
  onClose: () => void
}) {
  const id = stock.id
  const subscribe = useCallback((l: () => void) => store.subscribeRow(id, l), [store, id])
  const history = useSyncExternalStore(subscribe, () => store.getHistory(id))
  const price = history[history.length - 1] ?? stock.price
  const priceText = useMemo(() => money(price), [price])

  const [load, setLoad] = useState<Load>({ status: 'loading' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setLoad({ status: 'loading' })
    api.details(id).then(
      d => { if (live) setLoad({ status: 'ok', description: d.description }) },
      () => { if (live) setLoad({ status: 'error' }) },
    )
    return () => { live = false }
  }, [api, id, attempt])

  const [draft, setDraft] = useState(note)
  useEffect(() => setDraft(note), [note])
  const notesRef = useRef<HTMLTextAreaElement>(null)
  useEffect(() => notesRef.current?.focus(), [])

  return (
    <section
      role="region"
      aria-label="Details"
      onKeyDown={e => { if (e.key === 'Escape') { e.stopPropagation(); onClose() } }}
    >
      <h2>{stock.symbol} {stock.name}</h2>
      <p data-testid="detail-price">{priceText}</p>
      {load.status === 'loading' && <p>Loading…</p>}
      {load.status === 'ok' && <p>{load.description}</p>}
      {load.status === 'error' && (
        <div>
          <p role="alert">Couldn't load details</p>
          <button type="button" onClick={() => setAttempt(a => a + 1)}>Retry</button>
        </div>
      )}
      <label>
        Notes
        <textarea ref={notesRef} value={draft} onChange={e => setDraft(e.target.value)} />
      </label>
      <button type="button" onClick={() => onSave(id, draft)}>Save</button>
      <button type="button" disabled={!canUndo} onClick={onUndo}>Undo</button>
    </section>
  )
}
