// What the live pack's components share: glyphs from the specimen's 24 grid, and reading a prop that may be a plain
// value, a kerf State or Signal, or a getter (07 §4.5: `count={() => …}`, `items={inbox}`).
import {
  AlertIcon,
  AtIcon,
  BellIcon,
  BoardIcon,
  BoltIcon,
  CalendarIcon,
  CamIcon,
  CamOffIcon,
  ChatIcon,
  CheckIcon,
  CommentIcon,
  FlagIcon,
  GridIcon,
  HandIcon,
  LeaveIcon,
  LockIcon,
  MicIcon,
  MicOffIcon,
  MoreIcon,
  PlusIcon,
  PresentIcon,
  RefreshIcon,
  ScreenIcon,
  SignalIcon,
  SmileIcon,
  SpeakerIcon,
  UsersIcon,
  XIcon,
  iconSet,
} from '@kerf-js/veneer-icons'
import { hueOf } from '@kerf-js/veneer-core'
import { Box } from '@kerf-js/core/internal'
import { state, untrack, type State } from '@kerf-js/core'

const GLYPHS = {
  bell: BellIcon,
  at: AtIcon,
  comment: CommentIcon,
  flag: FlagIcon,
  check: CheckIcon,
  alert: AlertIcon,
  cal: CalendarIcon,
  more: MoreIcon,
  x: XIcon,
  plus: PlusIcon,
  lock: LockIcon,
  refresh: RefreshIcon,
  bolt: BoltIcon,
  mic: MicIcon,
  micoff: MicOffIcon,
  cam: CamIcon,
  camoff: CamOffIcon,
  screen: ScreenIcon,
  hand: HandIcon,
  smile: SmileIcon,
  chat: ChatIcon,
  users: UsersIcon,
  leave: LeaveIcon,
  signal: SignalIcon,
  grid: GridIcon,
  speaker: SpeakerIcon,
  present: PresentIcon,
  board: BoardIcon,
}

export type GlyphName = keyof typeof GLYPHS
export const G = iconSet(GLYPHS)

/** A prop that may be a value, a box with `.value` (State, Signal, Resource) or a getter. */
export function val<T>(v: T | { value: T } | (() => T)): T {
  if (typeof v === 'function') return (v as () => T)()
  if (v !== null && typeof v === 'object' && !Array.isArray(v) && 'value' in (v as object))
    return (v as { value: T }).value
  return v as T
}

const isState = (v: unknown): v is State<unknown> => v instanceof Box

/** One read and write over a bound State, a controlled value and a default (the Picker `bindable`, without its CSS). */
export function held<T>(
  value: () => State<T> | T | undefined,
  fallback: T,
  on?: () => ((v: T) => void) | undefined,
) {
  const own = state<T>(
    untrack(() => {
      const v = value()
      return isState(v) ? fallback : (v ?? fallback)
    }),
  )
  return {
    get value(): T {
      const v = value()
      return isState(v) ? v.value : v !== undefined ? v : own.value
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
export const avatarTint = (id: string) =>
  `--_bg:color-mix(in oklab,var(--veneer-color-data-${hueOf(id)}) 26%,var(--veneer-color-surface-raised))`
