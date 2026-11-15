import type { MediaAsset } from './media'
import { mediaConnection } from './media-network'
import { observeMediaViewport } from './media-viewport'
import { registerMediaStart } from './media-auto-warm'
import { mediaVideoSource, prepareMediaPoster } from './media-startup-sources'
export { mediaVideoSource } from './media-startup-sources'
/** Explicit placement overrides for the default sharp-start lifecycle. */
export interface MediaStartupOptions {
  autoplay?: boolean
  motion?: 'auto' | 'always' | undefined
  warm?: boolean
  priority?: boolean
}
class MediaStartup {
  disposed = false
  manual = false
  wanted = false
  ownPause = false
  resizeFrame = 0
  unregister: (() => void) | undefined
  still: Promise<void> | undefined
  resize: ResizeObserver | undefined
  stop: () => void
  readonly image = new Image()
  readonly motion = matchMedia('(prefers-reduced-motion: reduce)')
  readonly connection = (navigator as Navigator & { connection?: EventTarget }).connection
  constructor(
    readonly video: HTMLVideoElement,
    readonly asset: MediaAsset,
    readonly options: MediaStartupOptions,
  ) {
    video.addEventListener('pause', this.paused)
    video.addEventListener('play', this.played)
    document.addEventListener('visibilitychange', this.preferences)
    this.motion.addEventListener('change', this.preferences)
    this.connection?.addEventListener('change', this.preferences)
    this.select()
    this.stop = observeMediaViewport(video, (state) => {
      this.wanted = state.visible || state.anticipating
      if (state.preparing || this.wanted) void this.prepare()
      if (this.wanted) this.play()
      else if (options.autoplay) this.pause()
    })
    if (options.priority) void this.prepare()
    if (typeof ResizeObserver !== 'undefined') {
      this.resize = new ResizeObserver(() => {
        cancelAnimationFrame(this.resizeFrame)
        this.resizeFrame = requestAnimationFrame(() => {
          if (!this.disposed) this.select()
        })
      })
      this.resize.observe(video)
    }
  }
  allowed() {
    return (
      !document.hidden &&
      !mediaConnection().saveData &&
      (this.options.motion === 'always' || !this.motion.matches)
    )
  }
  prepare = () => {
    if (this.still) return this.still
    if (this.wanted || this.options.priority) this.video.dataset.mediaPreparing = 'true'
    return (this.still ??= prepareMediaPoster(
      this.video,
      this.asset,
      this.image,
      () => this.disposed,
    ).finally(() => {
      delete this.video.dataset.mediaPreparing
    }))
  }
  play() {
    if (this.options.autoplay && this.wanted && !this.manual && this.allowed())
      void this.prepare().then(() => {
        if (!this.disposed && this.wanted && !this.manual && this.allowed())
          void this.video.play().catch(() => {})
      })
  }
  select() {
    const { video, asset } = this,
      selected = mediaVideoSource(video, asset)
    if (video.dataset.mediaSource === selected.url) return
    const time = video.currentTime,
      running = !video.paused
    video.dataset.mediaSource = selected.url
    video.dataset.mediaWidth = String(selected.width)
    video.dataset.mediaHeight = String(selected.height)
    video.src = selected.url
    this.still = undefined
    if (time)
      video.addEventListener(
        'loadedmetadata',
        () => {
          video.currentTime = time
          if (running) void video.play().catch(() => {})
        },
        { once: true },
      )
    this.unregister?.()
    if (this.options.warm !== false)
      this.unregister = registerMediaStart(video, {
        url: selected.url,
        width: selected.width,
        height: selected.height,
        kind: 'file',
        prepare: this.prepare,
      })
  }
  pause() {
    if (!this.video.paused) {
      this.ownPause = true
      this.video.pause()
    }
  }
  paused = () => {
    if (this.ownPause) this.ownPause = false
    else if (!this.video.ended) this.manual = true
  }
  played = () => {
    this.manual = false
  }
  preferences = () => {
    if (this.allowed()) this.play()
    else this.pause()
  }
  dispose() {
    this.disposed = true
    delete this.video.dataset.mediaPreparing
    this.stop()
    this.resize?.disconnect()
    cancelAnimationFrame(this.resizeFrame)
    this.unregister?.()
    this.video.removeEventListener('pause', this.paused)
    this.video.removeEventListener('play', this.played)
    document.removeEventListener('visibilitychange', this.preferences)
    this.motion.removeEventListener('change', this.preferences)
    this.connection?.removeEventListener('change', this.preferences)
  }
}
/** Mount default selection and caching while preserving the caller's controls and Save source. */
export function attachMediaStartup(
  video: HTMLVideoElement,
  asset: MediaAsset,
  options: MediaStartupOptions = {},
) {
  const startup = new MediaStartup(video, asset, options)
  return () => startup.dispose()
}
