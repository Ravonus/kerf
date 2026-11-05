import { announce, pip, type PipCorner } from '@weft-js/warp-core'
import { derived } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import { val } from './shared'
import { meetingControls, meetingPeople } from './MeetingRoomState'
import { meetingMount } from './MeetingRoomMount'
import { meetingHandlers } from './MeetingRoomHandlers'
import type { MeetingRoomProps, Participant } from './MeetingRoomTypes'

export type RoomInputs = MeetingRoomProps

export function meetingModel(p: () => RoomInputs) {
  const people = derived(() => val<Participant[]>(p().participants) ?? [])
  const controls = meetingControls(p)
  const display = meetingPeople(p, controls, people)
  let root: HTMLDivElement | undefined
  let stage: HTMLDivElement | undefined

  const say = (text: string) => announce(root!.ownerDocument, text)
  meetingMount(
    p,
    controls,
    display,
    people,
    () => root,
    () => stage,
    say,
  )
  const handlers = meetingHandlers(
    p,
    controls,
    () => root,
    () => stage,
    say,
  )
  const pipStart = derived<PipCorner>(() => (controls.phone.value ? 'top-right' : 'bottom-right'))
  let pipEl: HTMLDivElement | undefined
  use(
    pip,
    () => pipEl,
    () => ({
      corner: pipStart.value,
      onMove: (c: PipCorner) => say(`Self view moved to ${c.replace('-', ' ')}`),
    }),
  )

  return {
    people,
    ...controls,
    ...display,
    ...handlers,
    say,
    setRoot: (n: HTMLDivElement) => (root = n),
    setStage: (n: HTMLDivElement) => (stage = n),
    setPip: (n: HTMLDivElement) => (pipEl = n),
  }
}
