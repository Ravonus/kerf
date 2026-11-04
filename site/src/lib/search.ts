import {
  fuzzyIndex,
  openIndex,
  searchIndex,
  type SearchHit,
  type SearchIndex,
  type SearchWire,
} from '@weft-js/warp-core'
import files from '../generated/search.json'

// Two tiers (research 40 §2). T0, titles, stays in this module for the life of the page and answers a key press in the
// same frame. T1, body text, lives in a worker. Both come from Cache Storage on a later visit, so search works offline
// once it has loaded. `seen` makes a repeat query no work at all.

const CACHE = 'weft-search-1'
let index: SearchIndex | undefined
let loading: Promise<SearchIndex> | undefined
const seen = new Map<string, SearchHit[]>()

/** The cached response, or the network's, kept for next time. Storage can be missing: then it's just a fetch. */
export async function cached(url: string): Promise<SearchWire> {
  const store = await caches?.open(CACHE).catch(() => undefined)
  const hit = await store?.match(url)
  if (hit) return hit.json()
  const res = await fetch(url)
  store?.put(url, res.clone()).catch(() => {})
  return res.json()
}

/** T0, once. Called at idle, and by a key press that beat it. */
export function loadTitles() {
  return (loading ??= cached(files.t0).then((wire) => (index = openIndex(wire))))
}

/** Synchronous: undefined until T0 has landed. */
export function titles(query: string): SearchHit[] | undefined {
  if (!index) return undefined
  const q = query.trim().toLowerCase()
  const held = seen.get(q)
  if (held) return held
  const hits = searchIndex(index, q, 48)
  const result = hits.length ? hits : fuzzyIndex(index, q)
  seen.set(q, result)
  return result
}

let worker: Worker | undefined
let asked = 0
const waiting = new Map<number, (hits: SearchHit[]) => void>()
const bodySeen = new Map<string, SearchHit[]>()

/** Start the body index: first focus, or first pointer over the trigger. */
export function warmBody() {
  if (worker) return
  worker = new Worker(new URL('./search.worker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e) => {
    waiting.get(e.data.id)?.(e.data.hits)
    waiting.delete(e.data.id)
  }
  worker.postMessage({ load: files.t1 })
}

/** Body matches. A newer query drops the older one's answer. */
export function body(query: string, signal: AbortSignal): Promise<SearchHit[]> {
  warmBody()
  const q = query.trim().toLowerCase()
  const held = bodySeen.get(q)
  if (held) return Promise.resolve(held)
  const id = ++asked
  worker!.postMessage({ id, q })
  return new Promise((ok) => {
    waiting.set(id, (hits) => {
      bodySeen.set(q, hits)
      ok(hits)
    })
    signal.addEventListener('abort', () => {
      waiting.delete(id)
      ok([])
    })
  })
}
