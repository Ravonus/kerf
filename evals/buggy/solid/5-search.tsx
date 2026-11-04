import { createEffect, createSignal, For, onCleanup, Show } from 'solid-js'

type Props = { search: (query: string, signal: AbortSignal) => Promise<string[]> }
type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'done'; items: string[] }

export function SearchBox(props: Props) {
  const [text, setText] = createSignal('')
  const [view, setView] = createSignal<View>({ kind: 'idle' })

  createEffect(() => {
    const q = text().trim()
    if (!q) {
      setView({ kind: 'idle' })
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      setView({ kind: 'loading' })
      props.search(q, ctrl.signal).then(
        (items) => setView({ kind: 'done', items }),
        () => setView({ kind: 'error' }),
      )
    }, 300)
    onCleanup(() => {
      clearTimeout(timer)
      ctrl.abort()
    })
  })

  const status = () => {
    const v = view()
    return v.kind === 'loading'
      ? 'Loading'
      : v.kind === 'error'
        ? 'Error'
        : v.kind === 'done' && v.items.length === 0
          ? 'No results'
          : null
  }
  const items = () => {
    const v = view()
    return v.kind === 'done' ? v.items : []
  }
  return (
    <div>
      <label>
        Search <input value={text()} onInput={(e) => setText(e.currentTarget.value)} />
      </label>
      <Show when={status()}>{(s) => <p data-testid="status">{s()}</p>}</Show>
      <ul aria-label="Results">
        <For each={items()}>{(r) => <li>{r}</li>}</For>
      </ul>
    </div>
  )
}
