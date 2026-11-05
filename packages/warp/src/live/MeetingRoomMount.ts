import { newHands, pauseOffscreen, speakerFollow } from '@weft-js/warp-core'
import { onCleanup, onMount, untrack, watch } from '@weft-js/core'
import { use } from '@weft-js/warp-core/weft'
import type { Participant } from './MeetingRoomTypes'
import type { RoomInputs } from './MeetingRoomModel'
import type { meetingControls, meetingPeople } from './MeetingRoomState'

export function meetingMount(
  props: () => RoomInputs,
  controls: ReturnType<typeof meetingControls>,
  display: ReturnType<typeof meetingPeople>,
  people: { readonly value: Participant[] },
  root: () => HTMLDivElement | undefined,
  stage: () => HTMLDivElement | undefined,
  say: (text: string) => void,
) {
  onMount(() => {
    const follow = speakerFollow((id) => (display.speaker.value = id))
    follow.update(untrack(() => display.speaker.value))
    watch(
      () => display.speaking.value,
      (s) => follow.update(s),
    )
    watch(
      () => people.value,
      (next, prev) => {
        if (prev) for (const p of newHands(prev, next)) say(`${p.name} raised a hand`)
      },
    )
    onCleanup(() => follow.destroy())
    const RO = (root()!.ownerDocument.defaultView as Window & typeof globalThis).ResizeObserver
    if (RO && untrack(() => props().compact) === undefined) {
      const ro = new RO((es) => {
        controls.narrow.value = es[0]!.contentRect.width < 600
      })
      ro.observe(root()!)
      onCleanup(() => ro.disconnect())
    }
  })
  use(pauseOffscreen, stage)
}
