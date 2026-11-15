import { initialMediaLevel, mediaConnection, slowMediaConnection } from './media-network'
import {
  playlistLevels,
  playlistStarts,
  warmFetch,
  warmUrl,
  WarmLimitError,
} from './media-warm-fetch'

/** A playlist for one artwork, with its displayed size for rendition selection. */
export interface MediaWarmTarget {
  url: string
  width: number
  height: number
  /** Native files are bounded complete cache entries; frames warm their first image chunk. */
  kind?: 'hls' | 'file' | 'frames'
  /** Re-evaluated before each artwork so the current viewport stays first. */
  priority?: () => number
  /** Prepare the responsive sharp still before warming its movie. */
  prepare?: () => Promise<void>
  /** Called after a complete cache fill, so shared players need not repeat it. */
  onComplete?: () => void
}
/** Deliberately small background work; foreground playback keeps its own independent loader. */
export interface MediaWarmOptions {
  startDelayMs?: number
  intervalMs?: number
  windowMs?: number
  windowBytes?: number
  maxResourceBytes?: number
}

function pause(ms: number, signal: AbortSignal) {
  return new Promise<void>((resolve) => {
    const finish = () => {
      clearTimeout(timer)
      signal.removeEventListener('abort', finish)
      resolve()
    }
    const timer = setTimeout(finish, ms)
    signal.addEventListener('abort', finish, { once: true })
    if (signal.aborted) finish()
  })
}

class WarmQueue {
  readonly lifetime = new AbortController()
  request: AbortController | undefined
  bytes = 0
  windowStarted = Date.now()
  readonly done: Promise<void>
  readonly waiting = () => {
    if (this.buffering()) this.request?.abort()
  }
  readonly visibility = () => {
    if (document.hidden) this.request?.abort()
  }

  constructor(
    readonly targets: readonly MediaWarmTarget[],
    readonly options: MediaWarmOptions,
  ) {
    document.addEventListener('visibilitychange', this.visibility)
    document.addEventListener('waiting', this.waiting, true)
    this.done = this.run().finally(() => this.removeListeners())
  }

  cancel() {
    this.lifetime.abort()
    this.request?.abort()
    this.removeListeners()
  }

  removeListeners() {
    document.removeEventListener('visibilitychange', this.visibility)
    document.removeEventListener('waiting', this.waiting, true)
  }

  buffering() {
    return [...document.querySelectorAll('video')].some(
      (video) => video.dataset.mediaPreparing === 'true' || (!video.paused && video.readyState < 3),
    )
  }

  resourceLimit() {
    return this.options.maxResourceBytes ?? 8 * 1024 * 1024
  }

  remaining() {
    if (Date.now() - this.windowStarted >= (this.options.windowMs ?? 60_000)) {
      this.windowStarted = Date.now()
      this.bytes = 0
    }
    return (
      (this.options.windowBytes ??
        (slowMediaConnection(mediaConnection()) ? 16 : 32) * 1024 * 1024) - this.bytes
    )
  }

  async read(url: string) {
    const limit = Math.min(this.remaining(), this.resourceLimit())
    if (limit <= 0) throw new Error('Media warm window exhausted')
    return warmFetch(url, this.request!.signal, limit, (bytes) => {
      this.bytes += bytes
    })
  }

  async start(target: MediaWarmTarget) {
    const source = warmUrl(target.url, location.href)
    let base = source,
      text = await this.read(source)
    if (target.kind === 'file') return
    if (target.kind === 'frames') {
      const frame = JSON.parse(text).frames?.[0]
      for (const name of [frame?.src, frame?.fallback])
        if (typeof name === 'string') await this.read(warmUrl(name, source))
      return
    }
    if (!text.startsWith('#EXTM3U') || /#EXT-X-(?:KEY|BYTERANGE)/.test(text)) return
    const levels = playlistLevels(text, source)
    if (levels.length) {
      base =
        levels[
          initialMediaLevel(
            levels,
            target.width,
            target.height,
            mediaConnection(),
            devicePixelRatio,
          )
        ]!.url
      text = await this.read(base)
    }
    if (!text.startsWith('#EXTM3U') || /#EXT-X-(?:KEY|BYTERANGE)/.test(text)) return
    const starts = playlistStarts(text, base)
    if (starts.init) await this.read(starts.init)
    if (starts.first) await this.read(starts.first)
  }

  async run() {
    await pause(this.options.startDelayMs ?? 0, this.lifetime.signal)
    const pending = new Map(this.targets.map((target) => [target.url, target]))
    const retried = new Set<string>()
    while (pending.size) {
      while (!this.lifetime.signal.aborted) {
        if (mediaConnection().saveData) return
        const buffering = this.buffering()
        const painting = [
          ...document.querySelectorAll<HTMLImageElement>('img[fetchpriority="high"]'),
        ].some((image) => !image.complete)
        if (!document.hidden && !buffering && !painting && this.remaining() > 32 * 1024) break
        await pause(2000, this.lifetime.signal)
      }
      if (this.lifetime.signal.aborted) return
      const target = [...pending.values()].sort(
        (a, b) => (a.priority?.() ?? 0) - (b.priority?.() ?? 0),
      )[0]!
      this.request = new AbortController()
      try {
        await target.prepare?.()
        if (this.lifetime.signal.aborted) return
        if (this.buffering()) continue
        await this.start(target)
        target.onComplete?.()
        pending.delete(target.url)
      } catch (error) {
        if (this.request.signal.aborted && !this.lifetime.signal.aborted) continue
        if (
          error instanceof WarmLimitError &&
          this.remaining() < this.resourceLimit() &&
          !retried.has(target.url)
        ) {
          retried.add(target.url)
          await pause(
            Math.max(1, (this.options.windowMs ?? 60000) - (Date.now() - this.windowStarted)),
            this.lifetime.signal,
          )
          continue
        }
        pending.delete(target.url)
      }
      await pause(
        this.options.intervalMs ?? (slowMediaConnection(mediaConnection()) ? 5000 : 250),
        this.lifetime.signal,
      )
    }
  }
}

/** Warm one first HLS segment at a time, with byte windows, hidden-tab pause and abortable route lifetime. */
export function warmMediaStarts(
  targets: readonly MediaWarmTarget[],
  options: MediaWarmOptions = {},
) {
  for (const [name, value] of Object.entries(options))
    if (
      !Number.isFinite(value) ||
      value < 0 ||
      ((name === 'windowMs' || name === 'maxResourceBytes') && value === 0) ||
      (name === 'windowBytes' && value <= 32 * 1024)
    )
      throw new RangeError(`Invalid media warm option: ${name}`)
  const queue = new WarmQueue(targets, options)
  return { cancel: () => queue.cancel(), done: queue.done }
}
