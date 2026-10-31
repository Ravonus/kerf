// What the live pack's components share: glyphs from the specimen's 24 grid, and reading a prop that may be a plain
// value, a weft State or Signal, or a getter (07 §4.5: `count={() => …}`, `items={inbox}`).
import { IconAlert, IconAt, IconBell, IconBoard, IconBolt, IconCalendar, IconCam, IconCamOff, IconChat, IconCheck, IconComment, IconFlag, IconGrid, IconHand, IconLeave, IconLock, IconMic, IconMicOff, IconMore, IconPlus, IconPresent, IconRefresh, IconScreen, IconSignal, IconSmile, IconSpeaker, IconUsers, IconX, iconSet } from '@weft/icons'
import { hueOf } from '@weft/ui-core'
import { Box, state, untrack, type State } from 'weft'

const GLYPHS = { bell: IconBell, at: IconAt, comment: IconComment, flag: IconFlag, check: IconCheck, alert: IconAlert, cal: IconCalendar, more: IconMore, x: IconX, plus: IconPlus, lock: IconLock, refresh: IconRefresh, bolt: IconBolt, mic: IconMic, micoff: IconMicOff, cam: IconCam, camoff: IconCamOff, screen: IconScreen, hand: IconHand, smile: IconSmile, chat: IconChat, users: IconUsers, leave: IconLeave, signal: IconSignal, grid: IconGrid, speaker: IconSpeaker, present: IconPresent, board: IconBoard }

export type GlyphName = keyof typeof GLYPHS
export const G = iconSet(GLYPHS)

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
