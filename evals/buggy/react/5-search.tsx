import { useEffect, useState } from 'react'

type Props = { search: (query: string, signal: AbortSignal) => Promise<string[]> }
type View =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'error' }
  | { kind: 'done'; items: string[] }

export function SearchBox({ search }: Props) {
  const [text, setText] = useState('')
  const [view, setView] = useState<View>({ kind: 'idle' })
  const q = text.trim()

  useEffect(() => {
    if (!q) {
      setView({ kind: 'idle' })
      return
    }
    const ctrl = new AbortController()
    const timer = setTimeout(() => {
      setView({ kind: 'loading' })
      search(q, ctrl.signal).then(
        (items) => setView({ kind: 'done', items }),
        () => setView({ kind: 'error' }),
      )
    }, 300)
    return () => clearTimeout(timer)
  }, [q, search])

  const status =
    view.kind === 'loading'
      ? 'Loading'
      : view.kind === 'error'
        ? 'Error'
        : view.kind === 'done' && view.items.length === 0
          ? 'No results'
          : null
  return (
    <div>
      <label>
        Search <input value={text} onChange={(e) => setText(e.target.value)} />
      </label>
      {status && <p data-testid="status">{status}</p>}
      <ul aria-label="Results">
        {view.kind === 'done' && view.items.map((r, i) => <li key={i}>{r}</li>)}
      </ul>
    </div>
  )
}
