// What the live pack's components share: glyphs from the specimen's 24 grid, and reading a prop that may be a plain
// value, a weft State or Signal, or a getter (07 §4.5: `count={() => …}`, `items={inbox}`).
import { hueOf } from '@weft/ui-core'
import { Box, state, untrack, type State } from 'weft'
import { Glyph } from '../parts'

export const PATHS = {
  bell: 'M6 16V11a6 6 0 1 1 12 0v5l1.5 2h-15zM10 21h4',
  at: 'M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0zM16 12v1.5a2.5 2.5 0 0 0 5 0V12a9 9 0 1 0-3.5 7.1',
  comment: 'M4 5h16v11h-7l-5 4v-4H4z',
  flag: 'M5 21V4h11l-2 4 2 4H5',
  check: 'M5 12.5l4.5 4.5L19 7',
  alert: 'M12 3l10 18H2zM12 10v5M12 18h.01',
  cal: 'M4 6h16v15H4zM4 10h16M8 3v5M16 3v5',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  x: 'M6 6l12 12M18 6L6 18',
  plus: 'M12 5v14M5 12h14',
  lock: 'M6 11h12v10H6zM8.5 11V7.5a3.5 3.5 0 0 1 7 0V11',
  refresh: 'M20 5v5h-5M4 19v-5h5M5.5 9A7 7 0 0 1 19 10M18.5 15A7 7 0 0 1 5 14',
  bolt: 'M13 3L5 14h6l-1 7 8-11h-6z',
  mic: 'M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3',
  micoff: 'M3 3l18 18M9 9v3a3 3 0 0 0 5.1 2.1M15 9.3V6a3 3 0 0 0-5.9-.8M5 11a7 7 0 0 0 11.6 5.3M19 11a7 7 0 0 1-.6 2.8M12 18v3',
  cam: 'M3 7h12v10H3zM15 10l6-3v10l-6-3',
  camoff: 'M3 3l18 18M15 10l6-3v10l-6-3M3 7h4M10.5 7H15v5.5M15 17H3V7',
  screen: 'M3 5h18v12H3zM8 21h8M12 17v4',
  hand: 'M8 13V5.5a1.5 1.5 0 0 1 3 0V12M11 11V4.5a1.5 1.5 0 0 1 3 0V12M14 11V6a1.5 1.5 0 0 1 3 0v7c0 4-2.5 7-6 7-2.6 0-4-1.4-5.5-3.5L3.8 13.6a1.5 1.5 0 0 1 2.5-1.6L8 14',
  smile: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM8.5 14.5s1.2 1.5 3.5 1.5 3.5-1.5 3.5-1.5M9 9.5h.01M15 9.5h.01',
  chat: 'M4 5h16v11H9l-5 4z',
  users: 'M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM2 21v-1a6 6 0 0 1 12 0v1M16 3.5a4 4 0 0 1 0 7.5M22 21v-1a6 6 0 0 0-4-5.6',
  leave: 'M3 15.5c5-5 13-5 18 0l-2.5 2.5-3-1.5v-2.5a10 10 0 0 0-7 0v2.5l-3 1.5z',
  signal: 'M4 20v-3M9 20v-7M14 20v-11M19 20V5',
  grid: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z',
  speaker: 'M4 4h16v11H4zM4 18h4v2H4zM10 18h4v2h-4zM16 18h4v2h-4z',
  present: 'M3 4h18v12H3zM12 16v4M8 20h8M7 9l3 3 4-4 3 3',
  board: 'M4 4h16v16H4zM8 15l3-4 3 3 2-2M8 8h3',
} as const

export type GlyphName = keyof typeof PATHS
export const G = ({ name, ...rest }: { name: GlyphName; [attr: string]: any }) => <Glyph d={PATHS[untrack(() => name)]} {...rest} />

/** A prop that may be a value, a box with `.value` (State, Signal, Resource) or a getter. */
export function val<T>(v: T | { value: T } | (() => T)): T {
  if (typeof v === 'function') return (v as () => T)()
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as object)) return (v as { value: T }).value
  return v as T
}

const isState = (v: any): v is State<any> => v instanceof Box

/** One read and write over a bound State, a controlled value and a default (the Picker `bindable`, without its CSS). */
export function held<T>(value: () => State<T> | T | undefined, fallback: T, on?: () => ((v: T) => void) | undefined) {
  const own = state<T>(untrack(() => { const v = value(); return isState(v) ? fallback : (v as T | undefined) ?? fallback }))
  return {
    get value(): T {
      const v = value()
      return isState(v) ? v.value : v !== undefined ? (v as T) : own.value
    },
    set(next: T) {
      const v = untrack(value)
      if (isState(v)) v.value = next
      else own.value = next
      untrack(() => on?.())?.(next)
    },
  }
}

/** The avatar and tile tint for a person: the data palette, never a status colour (07 §0). */
export const avatarTint = (id: string) => `--_bg:color-mix(in oklab,var(--warp-color-data-${hueOf(id)}) 26%,var(--warp-color-surface-raised))`
