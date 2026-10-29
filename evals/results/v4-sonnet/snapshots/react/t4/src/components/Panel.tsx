import { useEffect, useRef, useState, useSyncExternalStore, useCallback } from 'react'
import type { Api } from '../api'
import { money } from '../lib/format'
import type { NotesStore, QuoteStore } from '../store'

function DetailPrice({ id, store }: { id: string; store: QuoteStore }) {
  const subscribe = useCallback((l: () => void) => store.subscribeRow(id, l), [store, id])
  const price = useSyncExternalStore(subscribe, () => store.getRow(id).price)
  return <p data-testid="detail-price">{money(price)}</p>
}

function Description({ id, api }: { id: string; api: Api }) {
  const [state, setState] = useState<{ status: 'loading' | 'error' | 'ok'; text: string }>({ status: 'loading', text: '' })
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let live = true
    setState({ status: 'loading', text: '' })
    api.details(id).then(
      d => { if (live) setState({ status: 'ok', text: d.description }) },
      () => { if (live) setState({ status: 'error', text: '' }) },
    )
    return () => { live = false }
  }, [api, id, attempt])
  if (state.status === 'loading') return <p>Loading…</p>
  if (state.status === 'error') {
    return (
      <div>
        <p role="alert">Couldn't load details</p>
        <button type="button" onClick={() => setAttempt(a => a + 1)}>Retry</button>
      </div>
    )
  }
  return <p>{state.text}</p>
}

function Notes({ id, notes }: { id: string; notes: NotesStore }) {
  const [draft, setDraft] = useState(() => notes.get(id))
  const ref = useRef<HTMLTextAreaElement>(null)
  const depth = useSyncExternalStore(notes.subscribe, notes.depth)
  useEffect(() => { ref.current?.focus() }, [])
  return (
    <div>
      <label>
        Notes
        <textarea ref={ref} value={draft} onChange={e => setDraft(e.target.value)} />
      </label>
      <button type="button" onClick={() => notes.save(id, draft)}>Save</button>
      <button
        type="button"
        disabled={depth === 0}
        onClick={() => {
          const r = notes.undo()
          if (r && r.id === id) setDraft(r.note)
        }}
      >
        Undo
      </button>
    </div>
  )
}

export function Panel({ id, api, store, notes, onClose }: { id: string; api: Api; store: QuoteStore; notes: NotesStore; onClose: () => void }) {
  const { symbol, name } = store.getRow(id).stock
  return (
    <section
      role="region"
      aria-label="Details"
      onKeyDown={e => {
        if (e.key !== 'Escape') return
        e.stopPropagation()
        const opener = Array.from(document.querySelectorAll<HTMLElement>('button[aria-label]')).find(b => b.getAttribute('aria-label') === `Details ${symbol}`)
        onClose()
        opener?.focus()
      }}
    >
      <h2>{symbol} {name}</h2>
      <DetailPrice id={id} store={store} />
      <Description id={id} api={api} />
      <Notes id={id} notes={notes} />
    </section>
  )
}
