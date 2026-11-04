import { useEffect, useState } from 'react'
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
  const [attempt, setAttempt] = useState(0)
  const [details, setDetails] = useState<{
    state: 'loading' | 'failed' | 'ready'
    description?: string
  }>({ state: 'loading' })
  const [draft, setDraft] = useState(note)

  useEffect(() => setDraft(note), [note])

  useEffect(() => {
    let alive = true
    setDetails({ state: 'loading' })
    api.details(stock.id).then(
      (d) => {
        if (alive) setDetails({ state: 'ready', description: d.description })
      },
      () => {
        if (alive) setDetails({ state: 'failed' })
      },
    )
    return () => {
      alive = false
    }
  }, [api, stock.id, attempt])

  return (
    <section
      aria-label="Details"
      onKeyDown={(e) => {
        if (e.key === 'Escape') onClose()
      }}
    >
      <h2>
        {stock.symbol} · {stock.name}
      </h2>
      <p data-testid="detail-price">{money(price)}</p>
      {details.state === 'loading' && <p>Loading…</p>}
      {details.state === 'ready' && <p>{details.description}</p>}
      {details.state === 'failed' && (
        <>
          <p role="alert">Couldn't load details</p>
          <button onClick={() => setAttempt((a) => a + 1)}>Retry</button>
        </>
      )}
      <label>
        Notes <textarea autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} />
      </label>
      <button onClick={() => onSave(stock.id, draft)}>Save</button>
      <button disabled={!canUndo} onClick={onUndo}>
        Undo
      </button>
    </section>
  )
}
