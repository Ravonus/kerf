import { createEffect, createMemo, createSignal, on, onCleanup, onMount, Show } from 'solid-js'
import type { Api, Stock } from '../api'
import type { Live } from '../App'
import { money } from '../lib/format'

export function DetailsPanel(props: {
  api: Api
  stock: Stock
  live: Live
  note: () => string | undefined
  canUndo: () => boolean
  onSave: (text: string) => void
  onUndo: () => void
  onClose: () => void
}) {
  const [state, setState] = createSignal<{ s: 'loading' } | { s: 'error' } | { s: 'ok'; text: string }>({ s: 'loading' })
  let alive = true
  let token = 0
  onCleanup(() => (alive = false))
  function load() {
    const mine = ++token
    setState({ s: 'loading' })
    props.api.details(props.stock.id).then(
      d => alive && mine === token && setState({ s: 'ok', text: d.description }),
      () => alive && mine === token && setState({ s: 'error' }),
    )
  }
  load()

  const price = createMemo(() => money(props.live.price()))
  const [draft, setDraft] = createSignal(props.note() ?? '')
  createEffect(on(() => props.note(), v => setDraft(v ?? ''), { defer: true }))
  let area!: HTMLTextAreaElement
  onMount(() => area.focus())

  return (
    <section
      role="region"
      aria-label="Details"
      onKeyDown={e => {
        if (e.key === 'Escape') {
          e.stopPropagation()
          props.onClose()
        }
      }}
    >
      <h2>
        {props.stock.symbol} {props.stock.name}
      </h2>
      <p data-testid="detail-price">{price()}</p>
      <Show when={state().s === 'loading'}>
        <p>Loading…</p>
      </Show>
      <Show when={state().s === 'error'}>
        <p role="alert">Couldn't load details</p>
        <button type="button" onClick={load}>
          Retry
        </button>
      </Show>
      <Show when={(state() as { text?: string }).text !== undefined}>
        <p data-testid="detail-description">{(state() as { text: string }).text}</p>
      </Show>
      <label>
        Notes
        <textarea ref={area} value={draft()} onInput={e => setDraft(e.currentTarget.value)} />
      </label>
      <button type="button" onClick={() => props.onSave(draft())}>
        Save
      </button>
      <button type="button" disabled={!props.canUndo()} onClick={() => props.onUndo()}>
        Undo
      </button>
    </section>
  )
}
