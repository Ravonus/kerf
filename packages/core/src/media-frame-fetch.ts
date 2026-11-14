// Compressed lookahead overlaps network latency without retaining decoded image surfaces.
interface Pending {
  url: string
  promise: Promise<Blob>
  resolve(blob: Blob): void
  reject(error: unknown): void
  bytes?: number
}

/** A frame player's bounded compressed-image cache; its owner's signal cancels queued and active work. */
export class FrameImages {
  private cache = new Map<string, Pending>()
  private queue: Pending[] = []
  private active = 0
  private bytes = 0

  constructor(
    private signal: AbortSignal,
    private budget = 8 * 1024 * 1024,
  ) {
    signal.addEventListener(
      'abort',
      () => {
        for (const entry of this.queue) entry.reject(signal.reason)
        this.queue = []
        this.cache.clear()
        this.bytes = 0
      },
      { once: true },
    )
  }

  get(url: string): Promise<Blob> {
    this.signal.throwIfAborted()
    const previous = this.cache.get(url)
    if (previous) {
      this.cache.delete(url)
      this.cache.set(url, previous)
      return previous.promise
    }
    let resolve!: Pending['resolve'], reject!: Pending['reject']
    const promise = new Promise<Blob>((yes, no) => {
      resolve = yes
      reject = no
    })
    const entry = { url, promise, resolve, reject }
    this.cache.set(url, entry)
    this.queue.push(entry)
    this.pump()
    return promise
  }

  prefetch(urls: string[]) {
    for (const url of urls) void this.get(url).catch(() => {})
  }

  private trim() {
    for (const [url, entry] of this.cache) {
      if (this.bytes <= this.budget) break
      if (entry.bytes !== undefined) {
        this.bytes -= entry.bytes
        this.cache.delete(url)
      }
    }
  }

  private pump() {
    while (!this.signal.aborted && this.active < 3 && this.queue.length) {
      const entry = this.queue.shift()!
      this.active++
      void fetch(entry.url, { signal: this.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Frame unavailable (${response.status})`)
          const blob = await response.blob()
          this.signal.throwIfAborted()
          entry.bytes = blob.size
          this.bytes += blob.size
          this.trim()
          entry.resolve(blob)
        })
        .catch((error) => {
          this.cache.delete(entry.url)
          entry.reject(error)
        })
        .finally(() => {
          this.active--
          this.pump()
        })
    }
  }
}
