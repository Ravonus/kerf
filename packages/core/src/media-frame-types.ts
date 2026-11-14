/** A chunk starts from a complete frame, so seeking never downloads earlier chunks. */
export interface FramePatch {
  time: number
  duration: number
  x: number
  y: number
  width: number
  height: number
  src?: string
  type?: string
  fallback?: string
}

/** Absolute media times in seconds; image URLs resolve relative to the chunk URL. */
export interface FrameChunk {
  start: number
  end: number
  frames: FramePatch[]
}

/** Efficient image delivery keeps an optional original audio track separate. */
export interface FrameSequence {
  version: 1
  chunks: { start: number; end: number; src: string }[]
  audio?: { src: string; type: string; offset: number }
  pixels: 'exact' | 'perceptual'
  quality?: { metric: 'ssimulacra2'; target: number; minimum: number }
}

/** The common control surface of a native element and a frame player. */
export interface MediaPlayback extends EventTarget {
  currentTime: number
  readonly duration: number
  readonly paused: boolean
  readonly ended: boolean
  readonly readyState: number
  loop: boolean
  muted: boolean
  volume: number
  play(): Promise<void>
  pause(): void
}
