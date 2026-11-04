import { createEffect, createMemo } from 'solid-js'
import { createStore } from 'solid-js/store'
import type { Api } from './api'

export type SearchState = { state: 'idle' | 'pending' | 'failed'; results: Set<string> | null }

/**
 * One tab's server search, run whenever its trimmed query changes. A newer query aborts the older request (the
 * effect's cleanup); nothing else does, so the request outlives tab switches. Lives as long as its owner.
 */
export function createTabSearch(api: Api, query: () => string) {
  const [search, setSearch] = createStore<SearchState>({ state: 'idle', results: null })
  const q = createMemo(() => query().trim())
  createEffect(() => {
    const text = q()
    if (!text) {
      setSearch({ state: 'idle', results: null })
      return
    }
    const controller = new AbortController()
    setSearch('state', 'pending')
    api.search(text, controller.signal).then(
      (ids) => setSearch({ state: 'idle', results: new Set(ids) }),
      () => setSearch('state', 'failed'),
    )
  })
  return search
}
