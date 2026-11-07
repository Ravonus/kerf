import type { RoutePayload } from '../router'

const LIMIT = 32
const BYTES = 4 * 1024 * 1024

type Entry = { body: string; bytes: number; tag: string; tags: string[]; since: number }
type Read = { next: RoutePayload; since: number; version: number }
type FetchRoute = (url: URL, signal: AbortSignal, tag?: string) => Promise<Response>
export type Candidate = { res: Promise<Response>; since: number; version: number }

/** Bounded route bodies for conditional validation; never serves unvalidated content. */
export class RouteCache {
  private entries = new Map<string, Entry>()
  private bytes = 0
  private epoch = 0
  version = 0

  constructor(private build: string | null | undefined) {}

  /** Drop old validators when the client build identity changes. */
  setBuild(build: string | null | undefined) {
    if (this.build === build) return
    this.clear()
    this.build = build
  }

  private key(url: URL) {
    return this.build ? JSON.stringify([this.build, this.epoch, url.pathname + url.search]) : undefined
  }

  private remove(key: string) {
    const old = this.entries.get(key)
    if (old) this.bytes -= old.bytes
    this.entries.delete(key)
  }

  /** Forget affected loader data and invalidate every request already in flight. */
  invalidate(tags: string[]) {
    this.version++
    for (const [key, value] of this.entries)
      if (value.tags.some((tag) => tags.includes(tag))) this.remove(key)
  }

  /** Drop all build/session-dependent bodies and validators. */
  clear() {
    this.version++
    this.epoch++
    this.entries.clear()
    this.bytes = 0
  }

  private allowed(response: Response) {
    const policy = response.headers.get('cache-control') ?? ''
    const directives = policy.split(',').map((part) => part.trim().toLowerCase())
    const vary = (response.headers.get('vary') ?? '').split(',').map((part) => part.trim().toLowerCase())
    return directives.includes('private') && !directives.some((part) => /^no-store(?:\s*=|$)/.test(part)) &&
      !response.headers.has('set-cookie') && ['accept', 'cookie', 'authorization'].every((v) => vary.includes(v)) &&
      vary.every((v) => ['accept', 'cookie', 'authorization'].includes(v))
  }

  private store(key: string | undefined, response: Response, body: string, next: RoutePayload,
    since: number, canSeed: boolean) {
    if (!key) return
    this.remove(key)
    const tag = response.headers.get('etag')
    const bytes = new TextEncoder().encode(body).byteLength
    if (response.status !== 200 || next.s !== 200 || next.r || !tag || !this.allowed(response) ||
      (next.c?.length && !canSeed) || bytes > BYTES) return
    const tags = [...new Set(next.m.flatMap((match) => match.t ?? []))]
    this.entries.set(key, { body, bytes, tag, tags, since })
    this.bytes += bytes
    while (this.entries.size > LIMIT || this.bytes > BYTES) this.remove(this.entries.keys().next().value!)
  }

  /** Fetch or validate a body against the current generation before returning it. */
  async read(url: URL, signal: AbortSignal, fetchRoute: FetchRoute, now: () => number,
    canSeed: () => boolean, candidate?: Candidate): Promise<Read> {
    let allowTag = true
    for (;;) {
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      const version = this.version, key = this.key(url)
      const cached = key && allowTag ? this.entries.get(key) : undefined
      const held = candidate?.version === version ? candidate : undefined
      candidate = undefined
      let since = held?.since ?? now()
      const response = await (held?.res ?? fetchRoute(url, signal, cached?.tag))
      if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
      if (version !== this.version) continue
      if (response.status === 401 || response.status === 403) {
        this.clear()
        throw new Error('Route authorization failed')
      }
      let body: string
      if (response.status === 304) {
        if (!cached || held || !key || !this.allowed(response) || response.headers.get('etag') !== cached.tag ||
          this.entries.get(key) !== cached) {
          if (key) this.remove(key)
          if (!allowTag) throw new Error('Unexpected route 304')
          allowTag = false
          continue
        }
        body = cached.body
        since = cached.since
        this.entries.delete(key)
        this.entries.set(key, cached)
      } else {
        body = await response.text()
        if (signal.aborted) throw new DOMException('Aborted', 'AbortError')
        if (version !== this.version) continue
      }
      const next = JSON.parse(body) as RoutePayload
      if (response.status === 304 && next.c?.length && !canSeed()) {
        if (key) this.remove(key)
        allowTag = false
        continue
      }
      if (response.status !== 304) {
        if (next.p !== url.pathname + url.search && key) this.remove(key)
        else this.store(key, response, body, next, since, canSeed())
      }
      return { next, since, version }
    }
  }
}
