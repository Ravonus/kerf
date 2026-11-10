// Scrollbar geometry: how long the thumb is and where it sits, and the inverse for a drag. Pure.
import type { ThumbOptions } from './types'

/** The thumb's length for a `track` px track over a `view` px window into `total` px of content. */
export function thumbLength(track: number, view: number, total: number, o: ThumbOptions = {}) {
  if (track <= 0) return 0
  if (o.size !== undefined) return Math.min(track, Math.max(0, o.size))
  const min = Math.min(track, o.min ?? 24)
  const max = Math.min(track, o.max ?? track)
  const proportional = total > 0 ? (track * view) / total : track
  return Math.max(min, Math.min(max, proportional))
}

/** The thumb's offset along the track for scroll `progress` 0..1. */
export function thumbOffset(track: number, length: number, progress: number) {
  return Math.max(0, track - length) * Math.min(1, Math.max(0, progress))
}

/** How many px of scroll one px of thumb drag moves. */
export function dragRatio(track: number, length: number, max: number) {
  const room = track - length
  return room > 0 ? max / room : 0
}

/** The progress that centres the thumb on `at` px along the track: where a jump-click lands. */
export function progressAt(track: number, length: number, at: number) {
  const room = track - length
  return room > 0 ? Math.min(1, Math.max(0, (at - length / 2) / room)) : 0
}
