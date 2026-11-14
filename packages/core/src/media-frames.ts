// Independent image chunks bound seeking and decoded memory; optional native audio supplies the clock.
import type { MediaAsset } from './media'
import type { FrameChunk, FramePatch, FrameSequence, MediaPlayback } from './media-frame-types'

/** A frame player owns pending fetches, bitmaps, its clock and audio. */
export interface FramePlayer extends MediaPlayback {
  destroy(): void
}
type Options = { signal?: AbortSignal; loop?: boolean; muted?: boolean }

function validateChunk(
  chunk: FrameChunk,
  record: { start: number; end: number },
  asset: MediaAsset,
) {
  if (!Array.isArray(chunk.frames) || !chunk.frames.length || chunk.frames.length > 1200)
    throw new Error('Invalid frame chunk')
  let end = record.start
  for (const frame of chunk.frames) {
    if (
      !Number.isFinite(frame.time) ||
      !Number.isFinite(frame.duration) ||
      frame.duration <= 0 ||
      frame.time + 1e-6 < end ||
      frame.time < record.start ||
      frame.time + frame.duration > record.end + 1e-4 ||
      ![frame.x, frame.y, frame.width, frame.height].every(Number.isInteger) ||
      frame.x < 0 ||
      frame.y < 0 ||
      frame.width < 1 ||
      frame.height < 1 ||
      frame.x + frame.width > asset.width ||
      frame.y + frame.height > asset.height
    )
      throw new Error('Invalid frame timing or geometry')
    end = frame.time + frame.duration
  }
  const key = chunk.frames[0]!
  if (
    !key.src ||
    key.x !== 0 ||
    key.y !== 0 ||
    key.width !== asset.width ||
    key.height !== asset.height
  )
    throw new Error('A chunk must start with a complete keyframe')
  return chunk
}

class ImagePlayback extends EventTarget implements FramePlayer {
  private readonly sequence: FrameSequence
  private readonly context: CanvasRenderingContext2D
  private readonly chunks = new Map<string, Promise<FrameChunk>>()
  private pending = new AbortController()
  private generation = 0
  private closed = false
  private position = 0
  private anchor = 0
  private running = false
  private over = false
  private ready = 0
  private raf = 0
  private looping = false
  private silent = true
  private gain = 1
  private active = ''
  private shown = -1
  private drawing: Promise<void> | undefined
  private audio: HTMLAudioElement | undefined
  readonly duration: number

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly asset: MediaAsset,
    private readonly options: Options,
  ) {
    super()
    if (!asset.frames?.chunks.length) throw new Error('The media has no frame chunks')
    this.sequence = asset.frames
    const context = canvas.getContext('2d')
    if (!context) throw new Error('Canvas playback is unavailable')
    this.context = context
    canvas.width = asset.width
    canvas.height = asset.height
    this.duration = asset.duration ?? this.sequence.chunks.at(-1)!.end
    this.looping = options.loop ?? false
    this.silent = options.muted ?? true
    options.signal?.addEventListener('abort', this.destroy, { once: true })
    if (options.signal?.aborted) this.destroy()
  }

  get currentTime() {
    if (!this.running) return this.position
    const audio = this.audio
    return Math.min(
      this.duration,
      audio && !audio.paused && audio.readyState >= 2
        ? audio.currentTime + (this.sequence.audio?.offset ?? 0)
        : this.position + (performance.now() - this.anchor) / 1000,
    )
  }
  set currentTime(value: number) {
    if (!Number.isFinite(value) || this.closed) return
    this.position = Math.max(0, Math.min(this.duration, value))
    this.anchor = performance.now()
    this.over = false
    this.generation++
    this.pending.abort()
    this.pending = new AbortController()
    this.chunks.clear()
    this.active = ''
    this.shown = -1
    this.emit('seeking')
    void Promise.resolve(this.drawing)
      .catch(() => {})
      .then(() => this.render(this.position))
      .then(async () => {
        if (!this.closed) {
          this.emit('seeked')
          await this.syncAudio()
        }
      })
      .catch(() => {
        if (!this.closed && !this.pending.signal.aborted) this.emit('error')
      })
  }
  get paused() {
    return !this.running
  }
  get ended() {
    return this.over
  }
  get readyState() {
    return this.ready
  }
  get loop() {
    return this.looping
  }
  set loop(value: boolean) {
    this.looping = value
  }
  get muted() {
    return this.silent
  }
  set muted(value: boolean) {
    this.position = this.currentTime
    this.anchor = performance.now()
    this.silent = value
    void this.syncAudio().catch(() => this.emit('error'))
    this.emit('volumechange')
  }
  get volume() {
    return this.gain
  }
  set volume(value: number) {
    this.gain = Math.max(0, Math.min(1, value))
    if (this.audio) this.audio.volume = this.gain
    this.emit('volumechange')
  }

  private emit(name: string) {
    this.dispatchEvent(new Event(name))
    this.canvas.dispatchEvent(new Event(name))
  }
  private async syncAudio() {
    if (!this.running || this.silent || !this.sequence.audio) return this.audio?.pause()
    this.audio ??= new Audio(this.sequence.audio.src)
    this.audio.volume = this.gain
    const at = Math.max(0, this.position - this.sequence.audio.offset)
    if (Math.abs(this.audio.currentTime - at) > 0.05) this.audio.currentTime = at
    await this.audio.play()
  }
  private load(index: number) {
    const record = this.sequence.chunks[index]!,
      url = new URL(record.src, document.baseURI).href
    let promise = this.chunks.get(url)
    if (!promise) {
      promise = fetch(url, { signal: this.pending.signal })
        .then(async (response) => {
          if (!response.ok) throw new Error(`Frame chunk unavailable (${response.status})`)
          return validateChunk((await response.json()) as FrameChunk, record, this.asset)
        })
        .catch((error) => {
          this.chunks.delete(url)
          throw error
        })
      this.chunks.set(url, promise)
    }
    for (const key of this.chunks.keys())
      if (this.chunks.size > 2 && key !== url) this.chunks.delete(key)
    return { url, promise }
  }
  private async image(frame: FramePatch, base: string, signal: AbortSignal) {
    const decode = async (source: string) => {
      const response = await fetch(new URL(source, base), { signal })
      if (!response.ok) throw new Error(`Frame unavailable (${response.status})`)
      const bitmap = await createImageBitmap(await response.blob())
      if (signal.aborted) {
        bitmap.close()
        signal.throwIfAborted()
      }
      return bitmap
    }
    try {
      return await decode(frame.src!)
    } catch (error) {
      if (signal.aborted || !frame.fallback) throw error
      return decode(frame.fallback)
    }
  }
  private async draw(time: number) {
    const token = this.generation,
      found = this.sequence.chunks.findIndex((chunk) => time < chunk.end),
      index = found < 0 ? this.sequence.chunks.length - 1 : found
    const loaded = this.load(index),
      chunk = await loaded.promise
    this.pending.signal.throwIfAborted()
    if (token !== this.generation || this.closed) return
    if (this.active !== loaded.url || time < (chunk.frames[this.shown]?.time ?? 0)) {
      this.active = loaded.url
      this.shown = -1
    }
    let target = chunk.frames.findIndex((frame) => time < frame.time + frame.duration)
    if (target < 0) target = chunk.frames.length - 1
    for (let next = this.shown + 1; next <= target; next++) {
      const frame = chunk.frames[next]!
      if (frame.src) {
        const bitmap = await this.image(frame, loaded.url, this.pending.signal)
        try {
          if (token !== this.generation || this.closed) return
          this.context.clearRect(frame.x, frame.y, frame.width, frame.height)
          this.context.drawImage(bitmap, frame.x, frame.y, frame.width, frame.height)
        } finally {
          bitmap.close()
        }
      }
      this.shown = next
    }
    if (!this.ready) {
      this.ready = 4
      this.emit('loadedmetadata')
      this.emit('loadeddata')
      this.emit('canplay')
    }
    this.emit('timeupdate')
    if (index + 1 < this.sequence.chunks.length) void this.load(index + 1).promise.catch(() => {})
  }
  private render(time: number) {
    return (this.drawing ??= this.draw(time).finally(() => {
      this.drawing = undefined
    }))
  }
  private schedule() {
    this.raf = requestAnimationFrame(() => void this.tick().catch(() => {}))
  }
  private async tick() {
    this.raf = 0
    if (!this.running || this.closed) return
    const at = this.currentTime,
      token = this.generation
    try {
      await this.render(at)
      if (!this.running || this.closed) return
      if (at >= this.duration) {
        if (!this.looping) {
          this.position = this.duration
          this.running = false
          this.over = true
          this.audio?.pause()
          this.emit('ended')
          this.emit('pause')
          return
        }
        this.position = 0
        this.anchor = performance.now()
        this.active = ''
        this.shown = -1
        await this.syncAudio()
      }
      this.schedule()
    } catch (error) {
      if (this.closed || this.pending.signal.aborted) return
      if (token !== this.generation) {
        if (this.running) this.schedule()
        return
      }
      this.position = at
      this.running = false
      this.audio?.pause()
      this.emit('error')
      throw error
    }
  }
  async play() {
    if (this.closed) throw new Error('The media player was disposed')
    if (this.running) return
    if (this.over) this.currentTime = 0
    await this.render(this.position)
    if (this.closed) throw new DOMException('Aborted', 'AbortError')
    this.running = true
    this.over = false
    this.anchor = performance.now()
    try {
      await this.syncAudio()
    } catch (error) {
      this.running = false
      throw error
    }
    this.emit('play')
    this.emit('playing')
    this.schedule()
  }
  pause() {
    if (!this.running) return
    this.position = this.currentTime
    this.running = false
    cancelAnimationFrame(this.raf)
    this.audio?.pause()
    this.emit('pause')
  }
  destroy = () => {
    if (this.closed) return
    this.pause()
    this.closed = true
    this.generation++
    this.pending.abort()
    this.chunks.clear()
    this.audio?.removeAttribute('src')
    this.audio?.load()
    this.options.signal?.removeEventListener('abort', this.destroy)
  }
}

/** Draw lossless image patches at authored times using standard image decoding, with no ImageDecoder requirement. */
export function createFramePlayer(
  canvas: HTMLCanvasElement,
  asset: MediaAsset,
  options: Options = {},
): FramePlayer {
  return new ImagePlayback(canvas, asset, options)
}
