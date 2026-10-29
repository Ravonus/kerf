import { createEffect, createSignal, onCleanup, onMount, Show } from 'solid-js'
import type { Api, Stock } from '../api'
import type { Live } from '../quotes'
import { money } from '../lib/format'

type Load = { kind: 'loading' } | { kind: 'error' } | { kind: 'ok'; description: string }

export function DetailsPanel(props: {
  api: Api
  stock: Stock
  live: Live
  note: () => string
  canUndo: () => boolean
  onSave: (text: string) => void
  onUndo: () => void
  onClose: () => void
}) {
  const [load, setLoad] = createSignal<Load>({ kind: 'loading' })
  let alive = true
  let seq = 0
  onCleanup(() => { alive = false })

  function fetchDetails() {
    const mine = ++seq
    setLoad({ kind: 'loading' })
    props.api.details(props.stock.id).then(
      d => { if (alive && mine === seq) setLoad({ kind: 'ok', description: d.description }) },
      () => { if (alive && mine === seq) setLoad({ kind: 'error' }) },
    )
  }
  fetchDetails()

  const price = () => money(props.live.price())
  const [draft, setDraft] = createSignal(props.note())
  createEffect(() => setDraft(props.note()))

  let notes!: HTMLTextAreaElement
  onMount(() => notes.focus())

  return (
    <section
      role="region"
      aria-label="Details"
      onKeyDown={e => {
        if (e.key === 'Escape') props.onClose()
      }}
    >
      <h2>{props.stock.symbol} {props.stock.name}</h2>
      <p data-testid="detail-price">{price()}</p>
      <Show when={load().kind === 'loading'}>
        <p>Loading…</p>
      </Show>
      <Show when={load().kind === 'error'}>
        <p role="alert">Couldn't load details</p>
        <button type="button" onClick={fetchDetails}>Retry</button>
      </Show>
      <Show when={(() => { const l = load(); return l.kind === 'ok' ? l : false })()} keyed>
        {l => <p>{l.description}</p>}
      </Show>
      <label>
        Notes
        <textarea ref={notes} value={draft()} onInput={e => setDraft(e.currentTarget.value)} />
      </label>
      <button type="button" onClick={() => props.onSave(draft())}>Save</button>
      <button type="button" disabled={!props.canUndo()} onClick={() => props.onUndo()}>Undo</button>
    </section>
  )
}
