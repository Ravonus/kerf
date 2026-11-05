import { state } from '@weft-js/core'

// ---- the clock -----------------------------------------------------------------------------------------------------

export let seconds = 0,
  last = 0,
  raf = 0
export const tickers = new Set<(force?: boolean) => void>()
export const playing = state(
  typeof matchMedia !== 'function' || !matchMedia('(prefers-reduced-motion: reduce)').matches,
)

function loop(now: number) {
  raf = 0
  if (!tickers.size || !playing.value) {
    last = 0
    return
  }
  if (last) seconds += Math.min(now - last, 100) / 1000 // capped: a background tab resumes without a jump
  last = now
  // a snapshot: a ticker can remove itself while this runs
  for (const t of [...tickers]) t()
  raf = requestAnimationFrame(loop)
}
export const run = () => {
  raf ||= requestAnimationFrame(loop)
}

/** The one clock all surfaces share. Seek for deterministic capture: same seed and frame, same pixels. */
export const clock = {
  /** False from the start under `prefers-reduced-motion: reduce`. */
  playing: playing as { readonly value: boolean },
  get seconds() {
    return seconds
  },
  play() {
    playing.value = true
    run()
  },
  pause() {
    playing.value = false
  },
  /** Jump, and paint every animated surface now. */
  seek(to: number) {
    seconds = to
    // a snapshot: a ticker can remove itself while this runs
    for (const t of [...tickers]) t(true)
  },
}
