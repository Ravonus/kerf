import type { Api } from './api'

export type Track = {
  query: string
  started: boolean
  pending: boolean
  failed: boolean
  /** Ids for the last query that answered, or null for "show everything". */
  results: ReadonlySet<string> | null
}

const EMPTY: Track = { query: '', started: false, pending: false, failed: false, results: null }

/**
 * Search state per tab. A tab's request keeps going while another tab is shown; only a newer query in the same tab
 * aborts it. A restored query is not sent until its tab is first shown.
 */
export class TabSearches {
  private tracks = new Map<string, Track>()
  private controllers = new Map<string, AbortController>()
  private listeners = new Set<() => void>()

  constructor(private api: Api) {}

  get = (tab: string): Track => this.tracks.get(tab) ?? EMPTY

  subscribe = (cb: () => void) => {
    this.listeners.add(cb)
    return () => { this.listeners.delete(cb) }
  }

  /** The user changed this tab's text. */
  setText(tab: string, text: string) {
    const query = text.trim()
    const cur = this.get(tab)
    if (cur.started && cur.query === query) return
    this.run(tab, query)
  }

  /** The tab is shown: send its restored query, once. */
  ensureStarted(tab: string, text: string) {
    if (!this.get(tab).started) this.run(tab, text.trim())
  }

  private run(tab: string, query: string) {
    this.controllers.get(tab)?.abort()
    this.controllers.delete(tab)
    const prev = this.get(tab)
    if (query === '') {
      this.put(tab, { query, started: true, pending: false, failed: false, results: null })
      return
    }
    const ac = new AbortController()
    this.controllers.set(tab, ac)
    // While pending, the previous results stay on screen.
    this.put(tab, { query, started: true, pending: true, failed: false, results: prev.results })
    this.api.search(query, ac.signal).then(
      ids => {
        if (ac.signal.aborted) return
        this.controllers.delete(tab)
        this.put(tab, { query, started: true, pending: false, failed: false, results: new Set(ids) })
      },
      () => {
        if (ac.signal.aborted) return
        this.controllers.delete(tab)
        this.put(tab, { query, started: true, pending: false, failed: true, results: this.get(tab).results })
      },
    )
  }

  private put(tab: string, track: Track) {
    this.tracks.set(tab, track)
    this.listeners.forEach(cb => cb())
  }
}
