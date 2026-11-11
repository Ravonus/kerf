// A generator's worker side: runs one job per message and hands the result back, its buffers transferred. In a
// secure context, results are kept in Cache Storage under the worker's own (content-hashed) URL and the job's key,
// so a repeat visit reads the bytes instead of generating them.
import { pack, transferables, unpack } from './pack'

/** A request from `generate`. */
export interface Request {
  readonly id: number
  readonly key: string
  readonly args: unknown
  /** Keep the result in Cache Storage for the next visit. */
  readonly store: boolean
}

const DEV = (import.meta as { env?: { DEV?: boolean } }).env?.DEV !== false
const CACHE = 'keel-generate'

/** The cache entry's URL: the worker's path, so a new build (a new worker file) misses, then the job's key. */
const entry = (key: string) =>
  `${self.location.origin}/.keel-generate${self.location.pathname}/${encodeURIComponent(key)}`

async function cached(key: string): Promise<unknown> {
  if (DEV || typeof caches === 'undefined') return undefined
  try {
    const hit = await (await caches.open(CACHE)).match(entry(key))
    return hit ? unpack(await hit.arrayBuffer()) : undefined
  } catch {
    return undefined
  }
}

function keep(key: string, value: unknown) {
  if (DEV || typeof caches === 'undefined') return
  const body = pack(value)
  void caches
    .open(CACHE)
    .then((cache) => cache.put(entry(key), new Response(body)))
    .catch(() => {})
}

/** Answers `generate`'s messages with `run`. */
export function serve(run: (args: never) => unknown) {
  self.onmessage = async ({ data }: MessageEvent<Request>) => {
    try {
      let result = data.store ? await cached(data.key) : undefined
      if (result === undefined) {
        result = await run(data.args as never)
        // Packed before the transfer below takes the buffers away.
        if (data.store) keep(data.key, result)
      }
      self.postMessage({ id: data.id, result }, { transfer: transferables(result) })
    } catch (error) {
      self.postMessage({ id: data.id, error: (error as Error)?.message ?? String(error) })
    }
  }
}
