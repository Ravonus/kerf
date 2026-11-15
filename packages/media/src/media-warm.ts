import { initialMediaLevel, mediaConnection, slowMediaConnection } from './media-network'
import { playlistLevels, playlistStarts, warmFetch, warmUrl } from './media-warm-fetch'

/** A playlist for one artwork, with its displayed size for rendition selection. */
export interface MediaWarmTarget {
  url: string
  width: number
  height: number
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
  readonly visibility = () => {
    if (document.hidden) this.request?.abort()
  }

  constructor(
    readonly targets: readonly MediaWarmTarget[],
    readonly options: MediaWarmOptions,
  ) {
    document.addEventListener('visibilitychange', this.visibility)
    this.done = this.run().finally(() =>
      document.removeEventListener('visibilitychange', this.visibility),
    )
  }

  cancel() {
    this.lifetime.abort()
    this.request?.abort()
    document.removeEventListener('visibilitychange', this.visibility)
  }

  remaining() {
    if (Date.now() - this.windowStarted >= (this.options.windowMs ?? 60_000)) {
      this.windowStarted = Date.now()
      this.bytes = 0
    }
    return (
      (this.options.windowBytes ?? (slowMediaConnection(mediaConnection()) ? 128 : 512) * 1024) -
      this.bytes
    )
  }

  async read(url: string) {
    const limit = Math.min(this.remaining(), this.options.maxResourceBytes ?? 256 * 1024)
    if (limit <= 0) throw new Error('Media warm window exhausted')
    return warmFetch(url, this.request!.signal, limit, (bytes) => {
      this.bytes += bytes
    })
  }

  async start(target: MediaWarmTarget) {
    const source = warmUrl(target.url, location.href)
    let base = source,
      text = await this.read(source)
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
    await pause(this.options.startDelayMs ?? 6000, this.lifetime.signal)
    const seen = new Set<string>()
    for (const target of this.targets) {
      if (seen.has(target.url)) continue
      seen.add(target.url)
      while (!this.lifetime.signal.aborted) {
        if (mediaConnection().saveData) return
        const buffering = [...document.querySelectorAll('video')].some(
          (video) => !video.paused && video.readyState < 3,
        )
        const painting = [
          ...document.querySelectorAll<HTMLImageElement>('img[fetchpriority="high"]'),
        ].some((image) => !image.complete)
        if (!document.hidden && !buffering && !painting && this.remaining() > 32 * 1024) break
        await pause(2000, this.lifetime.signal)
      }
      if (this.lifetime.signal.aborted) return
      this.request = new AbortController()
      try {
        await this.start(target)
      } catch {
        /* Playback retries independently on user intent. */
      }
      await pause(
        this.options.intervalMs ?? (slowMediaConnection(mediaConnection()) ? 15_000 : 4000),
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
