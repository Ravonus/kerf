import { floatReaction } from '@kerf/veneer-core'
import type { RoomInputs } from './MeetingRoomModel'
import type { meetingControls } from './MeetingRoomState'

export function meetingHandlers(
  p: () => RoomInputs,
  controls: ReturnType<typeof meetingControls>,
  root: () => HTMLDivElement | undefined,
  stage: () => HTMLDivElement | undefined,
  say: (text: string) => void,
) {
  const toggle = (c: string) => {
    if (c === 'mic') {
      controls.micOn.set(!controls.micOn.value)
      say(controls.micOn.value ? 'Microphone on' : 'Microphone off')
    }
    if (c === 'camera') {
      controls.camOn.set(!controls.camOn.value)
      say(controls.camOn.value ? 'Camera on' : 'Camera off')
    }
    if (c === 'hand') {
      controls.handUp.set(!controls.handUp.value)
      say(controls.handUp.value ? 'Hand raised' : 'Hand lowered')
    }
    if (c === 'share') {
      controls.sharingOn.set(!controls.sharingOn.value)
      say(controls.sharingOn.value ? 'You are presenting' : 'Stopped presenting')
    }
    if (c === 'chat' || c === 'people') controls.side.set(controls.side.value === c ? null : c)
    if (c === 'react') {
      floatReaction(stage()!, p().reaction === undefined ? '🎉' : p().reaction!)
      p().onReact?.(p().reaction === undefined ? '🎉' : p().reaction!)
      say('You reacted')
    }
    if (c === 'more') {
      if (p().onMore) p().onMore!()
      else if (controls.phone.value) controls.side.set(controls.side.value ? null : 'people')
    }
  }
  const closeSide = () => {
    controls.side.set(null)
    root()
      ?.querySelector<HTMLElement>(
        '[data-scope="call-controls"] [data-part="control"][tabindex="0"]',
      )
      ?.focus()
  }
  const sideKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape' && !root()!.matches(':has([data-scope="call-controls"] :focus)'))
      closeSide()
  }
  return { toggle, closeSide, sideKey }
}
