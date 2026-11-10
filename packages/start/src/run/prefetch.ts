import type { RouteCache, Read } from './cache'
import { ask } from './helpers'

/** hover is a guess; focus and a press (the button is down, the click is coming) are near certain */
type Intent = 'hover' | 'focus' | 'press'
type Network = { saveData?: boolean; effectiveType?: string }
type Job = { ctrl: AbortController; promise: Promise<Read | undefined>; promoted: boolean }

/** Buffer at most the reservation, canceling the response stream when it is exceeded. */
async function limited(response: Response, limit: number, signal: AbortSignal): Promise<Response> {
  if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!response.body) return response
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = []
  let bytes = 0
  const abort = () => {
    void reader.cancel().catch(() => {})
  }
  signal.addEventListener('abort', abort, { once: true })
  try {
    for (;;) {
      const item = await reader.read()
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (item.done) break
      bytes += item.value.byteLength
      if (bytes > limit) {
        abort()
        throw new Error('Prefetch reservation exceeded')
      }
      chunks.push(item.value)
    }
  } finally {
    signal.removeEventListener('abort', abort)
    reader.releaseLock()
  }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  })
}

/** Admit and deduplicate bounded route-data speculation without evaluating route modules. */
export class Prefetch {
  private jobs = new Map<string, Job>()
  private stopped = false
  private used: { at: number; bytes: number }[] = []

  constructor(
    private cache: RouteCache,
    private now: () => number,
    private canSeed: () => boolean,
  ) {}

  get size() {
    return this.jobs.size
  }
  private key(url: URL) {
    return url.pathname + url.search
  }

  start(url: URL, intent: Intent, network: Network | undefined, online: boolean) {
    const key = this.key(url)
    if (this.stopped || this.jobs.has(key)) return
    if (!online || network?.saveData) return
    const kind = network?.effectiveType
    const fast = kind === '4g',
      slow = kind === '2g' || kind === 'slow-2g'
    if (!fast && intent === 'hover') return
    const cap = (fast ? 64 : slow ? 8 : 16) * 1024
    const allowance = (fast ? 256 : slow ? 16 : 32) * 1024
    const cost = this.cache.estimate(url)
    if (!cost || cost.total > cap || this.jobs.size >= (fast ? 2 : 1)) return
    const now = performance.now()
    this.used = this.used.filter((entry) => now - entry.at < 30_000)
    if (this.used.reduce((sum, entry) => sum + entry.bytes, 0) + cost.total > allowance) return
    this.used.push({ at: now, bytes: cost.total })
    const ctrl = new AbortController()
    const job: Job = { ctrl, promoted: false, promise: Promise.resolve(undefined) }
    this.jobs.set(key, job)
    const version = this.cache.version
    const fetchRoute = async (target: URL, signal: AbortSignal, tag?: string) => {
      if (version !== this.cache.version) throw new DOMException('Aborted', 'AbortError')
      return limited(await ask(target, signal, tag), cost.data, signal)
    }
    job.promise = this.cache
      .read(url, ctrl.signal, fetchRoute, this.now, this.canSeed)
      .then((result) =>
        ctrl.signal.aborted || version !== this.cache.version ? undefined : result,
      )
      .catch(() => undefined)
      .finally(() => {
        if (this.jobs.get(key) === job) this.jobs.delete(key)
      })
  }

  /** Promote an in-flight speculative request to demand without a second fetch. */
  claim(url: URL, signal: AbortSignal): Promise<Read | undefined> | undefined {
    const job = this.jobs.get(this.key(url))
    if (!job || job.ctrl.signal.aborted) return undefined
    job.promoted = true
    const abort = () => job.ctrl.abort()
    if (signal.aborted) abort()
    else signal.addEventListener('abort', abort, { once: true })
    return job.promise.finally(() => signal.removeEventListener('abort', abort))
  }

  /** Stop this owner's pending speculation and prevent further scheduling. */
  stop() {
    this.stopped = true
    this.cancel(true)
  }

  /** Schedule again after stop(): the page came back from the back/forward cache. */
  resume() {
    this.stopped = false
  }

  /** Cancel pending speculation, optionally including work promoted to demand. */
  cancel(all = false) {
    for (const job of this.jobs.values()) if (all || !job.promoted) job.ctrl.abort()
  }
}
