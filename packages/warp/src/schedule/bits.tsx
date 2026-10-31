// What the schedule pack's components share: sweep parts, glyphs, the clock.
import { IconRepeat } from '@weft/icons'
import { installSweep, nowIn } from '@weft/ui-core'
import { onCleanup, onMount, state, untrack, watch } from 'weft'
import '../styles'
import '@weft/ui-core/styles/app/tokens.css'
import '@weft/ui-core/styles/app/base.css'
import '@weft/ui-core/styles/rich/helpers.css'

export const SweepParts = () => <><span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span></>

/** calendar.css and agenda.css default `--_c` on the same element as `data-cal`, so the source's colour is set inline too. */
export const tint = (cal?: number) => `--_c:var(--warp-color-data-${cal ?? 1})`
export const RepeatGlyph = () => <IconRepeat />

/**
 * The wall clock for the now line (07 §2.2): the prop when there is one, else null through hydration and the browser's
 * clock a microtask after mount, then on each minute. It pauses while the page is hidden.
 */
export function useNow(now: () => string | undefined, zone: () => string | undefined) {
  const value = state<string | null>(untrack(now) ?? null)
  onMount(() => {
    let timer: ReturnType<typeof setTimeout> | undefined
    const tick = () => {
      clearTimeout(timer)
      if (untrack(now) || document.hidden) return
      value.value = nowIn(untrack(zone))
      timer = setTimeout(tick, 60000 - (Date.now() % 60000))
    }
    queueMicrotask(tick)
    document.addEventListener('visibilitychange', tick)
    watch(now, n => { if (n) value.value = n })
    onCleanup(() => { clearTimeout(timer); document.removeEventListener('visibilitychange', tick) })
  })
  return value
}

/** The container's width, 0 until it has been measured after mount. */
export function useWidth(el: () => Element | undefined) {
  const width = state(0)
  onMount(() => {
    const node = el()
    if (!node || typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(r => { width.value = r[0].contentRect.width })
    ro.observe(node)
    onCleanup(() => ro.disconnect())
  })
  return width
}

export const confirmSweep = (el: Element | null | undefined) => { if (el) installSweep(el.ownerDocument).confirm(el) }
