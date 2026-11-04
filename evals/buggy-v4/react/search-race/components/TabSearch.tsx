import { useEffect, useRef } from 'react'
import type { Api } from '../api'
import type { Tab } from '../App'

export type SearchState = { state: 'idle' | 'pending' | 'failed'; results: Set<string> | null }

/** One tab's search: a newer query aborts the older one; switching tabs doesn't (the component stays mounted). */
export function TabSearch({
  api,
  tab,
  query,
  onState,
}: {
  api: Api
  tab: Tab
  query: string
  onState: (tab: Tab, s: SearchState) => void
}) {
  const results = useRef<Set<string> | null>(null)
  const q = query.trim()
  useEffect(() => {
    if (!q) {
      results.current = null
      onState(tab, { state: 'idle', results: null })
      return
    }
    const controller = new AbortController()
    onState(tab, { state: 'pending', results: results.current })
    api.search(q, controller.signal).then(
      (ids) => {
        results.current = new Set(ids)
        onState(tab, { state: 'idle', results: results.current })
      },
      () => onState(tab, { state: 'failed', results: results.current }),
    )
  }, [api, tab, q, onState])
  return null
}
