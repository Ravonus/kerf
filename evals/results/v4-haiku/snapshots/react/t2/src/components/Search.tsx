import { useEffect, useState } from 'react'
import type { Api } from '../api'

/**
 * Owns the search text. Each change of the trimmed text sends one request and aborts the previous one; only the
 * latest request's results reach `onResults` (null means show everything).
 */
export function Search({ api, onResults }: { api: Api; onResults: (ids: string[] | null) => void }) {
  const [text, setText] = useState('')
  const [pending, setPending] = useState(false)
  const [failed, setFailed] = useState(false)
  const query = text.trim()

  useEffect(() => {
    if (query === '') {
      setPending(false)
      setFailed(false)
      onResults(null)
      return
    }
    const ac = new AbortController()
    setPending(true)
    api.search(query, ac.signal).then(
      ids => {
        if (ac.signal.aborted) return
        setPending(false)
        setFailed(false)
        onResults(ids)
      },
      () => {
        if (ac.signal.aborted) return
        setPending(false)
        setFailed(true)
      },
    )
    return () => ac.abort()
  }, [api, query, onResults])

  return (
    <div>
      <label>
        Search <input value={text} onChange={e => setText(e.target.value)} />
      </label>
      {pending && <p role="status">Searching…</p>}
      {failed && <p role="alert">Search failed</p>}
    </div>
  )
}
