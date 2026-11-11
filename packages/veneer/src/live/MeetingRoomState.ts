import { type LiveState, galleryCols } from '@kerf/veneer-core'
import { derived, state, untrack } from '@kerf/core'
import { held, val } from './shared'
import type { MeetingLayout, Participant } from './MeetingRoomTypes'
import type { RoomInputs } from './MeetingRoomModel'

export function meetingControls(props: () => RoomInputs) {
  const narrow = state(false)
  const phone = derived(() => props().compact ?? narrow.value)
  const chosen = held<MeetingLayout>(
    () => props().layout,
    untrack(() => props().compact) ? 'speaker' : 'gallery',
    () => props().onLayoutChange,
  )
  const micOn = held<boolean>(
    () => props().mic,
    true,
    () => props().onMic,
  )
  const camOn = held<boolean>(
    () => props().camera,
    true,
    () => props().onCamera,
  )
  const handUp = held<boolean>(
    () => props().hand,
    false,
    () => props().onHand,
  )
  const sharingOn = held<boolean>(
    () => props().sharing,
    false,
    () => props().onShare,
  )
  const side = held<'people' | 'chat' | null>(() => props().sidebar, null)
  const L = derived<MeetingLayout>(() =>
    sharingOn.value
      ? 'presentation'
      : phone.value && chosen.value === 'gallery'
        ? 'speaker'
        : chosen.value,
  )
  return { narrow, phone, chosen, micOn, camOn, handUp, sharingOn, side, L }
}

export function meetingPeople(
  props: () => RoomInputs,
  controls: ReturnType<typeof meetingControls>,
  people: { readonly value: Participant[] },
) {
  const speaking = derived(() => people.value.find((p) => p.isSpeaking)?.id)
  const speaker = state<string | undefined>(untrack(() => speaking.value ?? people.value[0]?.id))
  const main = derived(() => people.value.find((p) => p.id === speaker.value) ?? people.value[0])
  const others = derived(() => people.value.filter((p) => p.id !== main.value?.id))
  const me = derived<Participant>(() => ({
    ...props().self,
    isMuted: !controls.micOn.value,
    handRaised: controls.handUp.value,
    isCamOn: controls.camOn.value,
  }))
  const cols = derived(() => galleryCols(people.value.length))
  const network = derived<LiveState>(() => {
    const s = val<string>(props().live === undefined ? 'live' : props().live!)
    return s === 'open' || s === 'live'
      ? 'live'
      : s === 'reconnecting'
        ? 'reconnecting'
        : s === 'connecting'
          ? 'connecting'
          : 'offline'
  })
  const netWords = derived(() =>
    network.value === 'live'
      ? 'Good connection'
      : network.value === 'reconnecting'
        ? 'Reconnecting…'
        : network.value === 'connecting'
          ? 'Connecting…'
          : 'Offline',
  )
  const presenterText = derived(() =>
    controls.sharingOn.value
      ? 'You are presenting'
      : `${props().presenter ?? 'Someone'} is presenting`,
  )
  const v = untrack(() => props().video)
  return { speaking, speaker, main, others, me, cols, network, netWords, presenterText, v }
}
