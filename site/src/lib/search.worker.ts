import { openIndex, searchIndex, type SearchIndex, type SearchWire } from '@kerf/veneer-core/search'

// The body index, off the main thread. A query that lands before the index waits for it; only the newest waiter runs.
let index: SearchIndex | undefined
let queued: { id: number; q: string } | undefined

async function wire(url: string): Promise<SearchWire> {
  const store = await caches?.open('kerf-search-1').catch(() => undefined)
  const hit = await store?.match(url)
  if (hit) return hit.json()
  const res = await fetch(url)
  store?.put(url, res.clone()).catch(() => {})
  return res.json()
}

const answer = (id: number, q: string) => postMessage({ id, hits: searchIndex(index!, q, 16) })

const receive = async (e: MessageEvent) => {
  if (e.data.load) {
    index = openIndex(await wire(e.data.load))
    if (queued) answer(queued.id, queued.q)
    return
  }
  if (index) answer(e.data.id, e.data.q)
  else queued = e.data
}
addEventListener('message', (e) => void receive(e))
