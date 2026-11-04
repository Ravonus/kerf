// timeline() (research 15 §3.4, §7.3): a video or audio element as boxes. `currentTime` and `playing` are state, and a
// write is a command (seek, play, pause). `currentTime` updates once per presented frame, through
// requestVideoFrameCallback, or rAF on audio and where it's missing. A cue fires when playback crosses it, not on a seek.

import {
  batch,
  derived,
  getOwner,
  onCleanup,
  state,
  watch,
  type Derived,
  type State,
} from './index'
import type { MediaAsset } from './media'

/** A timeline's named moments and how it follows its element. */
export interface TimelineOptions<C extends string> {
  /** Seconds from the start, by name. */
  cues?: Record<C, number>
  loop?: boolean
}

/** Code in sync with a video or audio element: the current time, and which cue it's on. */
export interface Timeline<C extends string = string> {
  /** Write to seek. */
  currentTime: State<number>
  /** Write to play or pause. A blocked `play()` leaves it false and puts the error in `error`. */
  playing: State<boolean>
  duration: Derived<number>
  ended: Derived<boolean>
  /** The last cue reached, or null before the first. */
  cue: Derived<C | null>
  error: Derived<Error | null>
  /** Runs when playback crosses the cue, cleaned up with the owner. */
  on(cue: C, run: () => void): () => void
  /** `<Media timeline={t}>` calls this. */
  bind(element: HTMLMediaElement): () => void
}

/** The timeline of an animated asset, a video or an audio file. On the server it stays at 0, paused. */
export function timeline<C extends string = never>(
  asset: MediaAsset,
  options: TimelineOptions<C> = {},
): Timeline<C> {
  const currentTime = state(0)
  const playing = state(false)
  const length = state(asset.duration ?? 0)
  const over = state(false)
  const reached = state<C | null>(null)
  const failure = state<Error | null>(null)
  const cues = Object.entries<number>(options.cues ?? {}).sort((a, b) => a[1] - b[1]) as [
    C,
    number,
  ][]
  const listeners = new Map<C, Set<() => void>>()
  let media: HTMLMediaElement | undefined
  let seen = 0
  let shown = false
  let last = -1

  const place = (t: number, crossing: boolean) => {
    batch(() => {
      seen = t
      currentTime.value = t
      let at: C | null = null
      for (const [id, when] of cues) {
        if (when > t) break
        at = id
        if (crossing && when > last) listeners.get(id)?.forEach((run) => run())
      }
      reached.value = at
    })
    last = t
  }

  watch(
    () => currentTime.value,
    (t) => {
      if (media && t !== seen) media.currentTime = t
    },
  )
  watch(
    () => playing.value,
    (on) => {
      shown = on
      if (!media || on !== media.paused) return
      if (on)
        media.play().catch((e) => {
          failure.value = e
          playing.value = false
        })
      else media.pause()
    },
  )

  return {
    currentTime,
    playing,
    duration: derived(() => length.value),
    ended: derived(() => over.value),
    cue: derived(() => reached.value),
    error: derived(() => failure.value),
    on(cue, run) {
      const set = listeners.get(cue) ?? new Set()
      listeners.set(cue, set)
      set.add(run)
      const off = () => set.delete(run)
      if (getOwner()) onCleanup(off)
      return off
    },
    bind(el) {
      media = el
      if (options.loop !== undefined) el.loop = options.loop
      const video = el as HTMLVideoElement
      const frames = !!video.requestVideoFrameCallback
      let live = true
      const next = () => {
        if (el.paused || !live) return
        if (frames)
          video.requestVideoFrameCallback((_, m) => {
            tick(m.mediaTime)
          })
        else requestAnimationFrame(() => tick(el.currentTime))
      }
      const tick = (t: number) => {
        if (t < last) last = -1 // the loop came round
        place(t, true)
        next()
      }
      const sync = () => {
        if (shown !== !el.paused) playing.value = !el.paused
        over.value = el.ended
      }
      const events: [string, () => void][] = [
        [
          'play',
          () => {
            sync()
            next()
          },
        ],
        ['pause', sync],
        ['ended', sync],
        [
          'seeked',
          () => {
            last = el.currentTime
            place(el.currentTime, false)
          },
        ],
        [
          'durationchange',
          () => {
            if (Number.isFinite(el.duration)) length.value = el.duration
          },
        ],
      ]
      for (const [name, run] of events) el.addEventListener(name, run)
      sync()
      next()
      return () => {
        live = false
        media = undefined
        for (const [name, run] of events) el.removeEventListener(name, run)
      }
    },
  }
}
