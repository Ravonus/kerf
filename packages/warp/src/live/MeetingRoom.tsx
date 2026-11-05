import type { MeetingRoomProps } from './MeetingRoomTypes'
import { meetingModel } from './MeetingRoomModel'
import { MeetingRoomView } from './MeetingRoomView'
import '../styles'
import '@weft-js/warp-core/styles/app/base.css'
import '@weft-js/warp-core/styles/app/room.css'
import '@weft-js/warp-core/styles/app/tile.css'
import '@weft-js/warp-core/styles/app/pip.css'
import '@weft-js/warp-core/styles/app/call-controls.css'
export type { MeetingLayout, MeetingRoomProps, Participant } from './MeetingRoomTypes'
export * from './MeetingRoomTile'
export * from './MeetingRoomControlBar'

/**
 * MeetingRoom (07 §3): header, stage in four layouts, sidebar, ControlBar. A dark island unless told otherwise. Speaker
 * follows the active speaker with a 1.5 s hold, off-screen video pauses, hands are announced and speakers aren't.
 */
export function MeetingRoom({
  title,
  participants,
  self,
  layout,
  onLayoutChange,
  timer,
  recording,
  live = 'live',
  compact,
  theme = 'dark',
  video,
  share,
  presenter,
  shareTitle = 'Shared screen',
  board,
  chat,
  invite,
  mic,
  camera,
  hand,
  sharing,
  sidebar,
  reaction = '🎉',
  onMic,
  onCamera,
  onHand,
  onShare,
  onReact,
  onLeave,
  onMore,
}: MeetingRoomProps) {
  const p = () => ({
    title,
    participants,
    self,
    layout,
    onLayoutChange,
    timer,
    recording,
    live,
    compact,
    theme,
    video,
    share,
    presenter,
    shareTitle,
    board,
    chat,
    invite,
    mic,
    camera,
    hand,
    sharing,
    sidebar,
    reaction,
    onMic,
    onCamera,
    onHand,
    onShare,
    onReact: onReact ? (emoji: string) => onReact?.(emoji) : undefined,
    onLeave: onLeave ? () => onLeave?.() : undefined,
    onMore: onMore ? () => onMore() : undefined,
  })
  const model = meetingModel(p)
  return <MeetingRoomView model={model} p={p} />
}
