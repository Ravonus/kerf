import type { ParticipantLike } from '@kerf/veneer-core'
import type { State } from '@kerf/core'

/** How the room arranges its tiles. */
export type MeetingLayout = 'gallery' | 'speaker' | 'presentation' | 'board'
/** Someone in the room. */
export interface Participant extends ParticipantLike {
  isCamOn?: boolean
}
export type Video = (p: Participant) => unknown

/** Props for MeetingRoom. */
export interface MeetingRoomProps {
  title: string
  participants: Participant[] | { value: Participant[] } | (() => Participant[])
  self: Participant
  layout?: State<MeetingLayout> | MeetingLayout | undefined
  /** Called with the layout picked in the switcher. */
  onLayoutChange?: ((l: MeetingLayout) => void) | undefined
  /** Elapsed time, already formatted (the caller owns the clock). */
  timer?: unknown
  /** Shows a Rec badge in the header. */
  recording?: boolean | undefined
  /** The room's connection: `room.status`, mapped. */
  live?: string | (() => string) | undefined
  /** Phone: speaker layout, no switcher, icon-only Leave. Unset: decided by the room's own width after mount. */
  compact?: boolean | undefined
  /** Dark island by default (07 §7). */
  theme?: 'dark' | 'light' | undefined
  /** Media is the caller's: Veneer never touches getUserMedia. Return the <video> for a participant. */
  video?: Video | undefined
  /** The shared screen, for presentation layout. */
  share?: (() => unknown) | undefined
  presenter?: string | undefined
  /** What is being shared, in the presentation header. Default "Shared screen". */
  shareTitle?: string | undefined
  board?: (() => unknown) | undefined
  /** The Chat panel's body. */
  chat?: (() => unknown) | undefined
  /** Below People: "Invite people". */
  invite?: (() => unknown) | undefined
  /** Whether your mic is on: a state the room writes, or a value with `onMic`. */
  mic?: State<boolean> | boolean | undefined
  /** Whether your camera is on: a state the room writes, or a value with `onCamera`. */
  camera?: State<boolean> | boolean | undefined
  /** Whether your hand is raised: a state the room writes, or a value with `onHand`. */
  hand?: State<boolean> | boolean | undefined
  /** Whether you are sharing your screen: a state the room writes, or a value with `onShare`. */
  sharing?: State<boolean> | boolean | undefined
  /** The open side panel, `people` or `chat`, or null for none. */
  sidebar?: State<'people' | 'chat' | null> | 'people' | 'chat' | null | undefined
  /** The emoji the React button sends. Default 🎉. */
  reaction?: string | undefined
  /** Called with the mic's new state. Start or stop the track here. */
  onMic?: ((on: boolean) => void) | undefined
  /** Called with the camera's new state. Start or stop the track here. */
  onCamera?: ((on: boolean) => void) | undefined
  /** Called with `true` when you raise your hand and `false` when you lower it. */
  onHand?: ((on: boolean) => void) | undefined
  /** Called with `true` to start sharing your screen and `false` to stop. */
  onShare?: ((on: boolean) => void) | undefined
  /** Called with the emoji when you react. */
  onReact?: ((emoji: string) => void) | undefined
  /** Called when Leave is pressed. */
  onLeave?: (() => void) | undefined
  /** More: replaces the phone's default, which opens the People and Chat panel. */
  onMore?: (() => void) | undefined
}
