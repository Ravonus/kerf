// What the agent pack's components share: glyphs from the app specimen, the sweep's two parts, an icon button, a value
// held in a State or a plain prop, and the thin progress bar.
import { installSweep } from '@weft/ui-core'
import { Box, onMount, state, untrack, type State } from 'weft'
import { Button } from '../Button'
import { Glyph } from '../parts'
import '@weft/ui-core/styles/app/tokens.css'
import '@weft/ui-core/styles/app/base.css'
import '@weft/ui-core/styles/components/progress.css'

export const G = {
  spark: 'M12 3l1.8 5.5L19 10l-5.2 1.5L12 17l-1.8-5.5L5 10l5.2-1.5zM19 16l.8 2.2L22 19l-2.2.8L19 22l-.8-2.2L16 19l2.2-.8z',
  copy: 'M8 8h12v12H8zM16 8V4H4v12h4',
  edit: 'M4 20h4L19 9l-4-4L4 16zM13.5 6.5l4 4',
  up: 'M7 10v10H4V10zM7 10l4-7a2 2 0 0 1 3 2l-1 4h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 20H7',
  down: 'M7 14V4H4v10zM7 14l4 7a2 2 0 0 0 3-2l-1-4h6a2 2 0 0 0 2-2.3l-1.4-7A2 2 0 0 0 17.6 4H7',
  refresh: 'M20 5v5h-5M4 19v-5h5M5.5 9A7 7 0 0 1 19 10M18.5 15A7 7 0 0 1 5 14',
  branch: 'M6 3v12M18 9a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM6 21a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM18 9a9 9 0 0 1-9 9',
  clip: 'M20 11.5l-8 8a5 5 0 0 1-7-7l8.5-8.5a3.3 3.3 0 0 1 4.7 4.7L9.7 17.2a1.7 1.7 0 0 1-2.4-2.4L15 7',
  cmd: 'M9 6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  globe: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18',
  send: 'M5 12h13M12 5l7 7-7 7',
  stop: 'M7 7h10v10H7z',
  file: 'M6 3h8l5 5v13H6zM14 3v5h5',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.6 0-4-1.4-5.5-3.5L3.8 13.6a1.5 1.5 0 0 1 2.5-1.6L8 14',
  ext: 'M14 4h6v6M20 4l-9 9M18 14v6H4V6h6',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
}

/** The two sweep parts a [data-sweep] host carries. */
export const Sweep = () => <><span data-part="sweep-base" aria-hidden="true"></span><span data-part="sweep" aria-hidden="true"></span></>

/** Follow the sweep machine; for hosts this pack draws by hand. */
export const useSweep = () => onMount(() => { installSweep() })

/** A small ghost icon button, named by `label`. */
export function IconButton({ d, label, ...rest }: { d: string; label: string; [attr: string]: any }) {
  return <Button emphasis="ghost" tone="neutral" size="sm" label={label} data-icon-only="" {...rest}><Glyph d={d} /></Button>
}

/** A thin determinate bar; `value` is 0 to 1. */
export function Bar({ label, value }: { label: string; value: number }) {
  return <div data-scope="progress" data-part="root" role="progressbar" aria-label={label} aria-valuemin="0" aria-valuemax="100" aria-valuenow={Math.round(value * 100)} style={`--_v:${value}`}><div data-part="track"><div data-part="range"></div></div></div>
}

/** One read and write over a State to bind or a plain value with its change callback. */
export function held<T>(value: () => State<T> | T | undefined, fallback: T, onChange?: () => ((v: T) => void) | undefined) {
  const box = (v: unknown): v is State<T> => v instanceof Box
  const own = state<T>(untrack(() => { const v = value(); return box(v) || v === undefined ? fallback : v }))
  return {
    get value(): T { const v = value(); return box(v) ? v.value : v !== undefined ? v : own.value },
    set(next: T) {
      const v = untrack(value)
      if (box(v)) v.value = next
      else own.value = next
      untrack(onChange ?? (() => undefined))?.(next)
    },
  }
}
