import { createEffect, createResource, createSignal, Match, on, onMount, Switch } from 'solid-js'
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

// Mounted once per open stock (keyed by the App), so a late description for another stock has no panel to land in.
export function DetailsPanel(props: Props) {
  const [details, { refetch }] = createResource(() => props.api.details(props.stock.id))
  const [draft, setDraft] = createSignal(props.note)
  const [price] = createSignal(props.price)
  createEffect(
    on(
      () => props.note,
      (note) => setDraft(note),
      { defer: true },
    ),
  )

  let notes!: HTMLTextAreaElement
  onMount(() => notes.focus())

  return (
    <section
      aria-label="Details"
      onKeyDown={(e) => {
        if (e.key === 'Escape') props.onClose()
      }}
    >
      <h2>
        {props.stock.symbol} · {props.stock.name}
      </h2>
      <p data-testid="detail-price">{money(price())}</p>
      <Switch>
        <Match when={details.loading}>
          <p>Loading…</p>
        </Match>
        <Match when={details.error}>
          <p role="alert">Couldn't load details</p>
          <button onClick={() => refetch()}>Retry</button>
        </Match>
        <Match when={details.state === 'ready'}>
          <p>{details()?.description}</p>
        </Match>
      </Switch>
      <label>
        Notes{' '}
        <textarea ref={notes} value={draft()} onInput={(e) => setDraft(e.currentTarget.value)} />
      </label>
      <button onClick={() => props.onSave(props.stock.id, draft())}>Save</button>
      <button disabled={!props.canUndo} onClick={() => props.onUndo()}>
        Undo
      </button>
    </section>
  )
}
