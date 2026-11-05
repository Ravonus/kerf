import { ControlBar } from './MeetingRoomControlBar'
import { MeetingHeader, MeetingStage, MeetingSidebar } from './MeetingRoomParts'
import type { meetingModel, RoomInputs } from './MeetingRoomModel'

export function MeetingRoomView({
  model,
  p,
}: {
  model: ReturnType<typeof meetingModel>
  p: () => RoomInputs
}) {
  return (
    <div
      ref={model.setRoot}
      data-scope="room"
      data-part="root"
      data-theme={p().theme}
      role="region"
      aria-label={`${p().title} meeting`}
    >
      <MeetingHeader model={model} p={p} />
      <MeetingStage model={model} p={p} />
      <MeetingSidebar model={model} p={p} />
      <ControlBar
        mic={model.micOn.value}
        camera={model.camOn.value}
        sharing={model.sharingOn.value}
        hand={model.handUp.value}
        side={model.side.value}
        compact={model.phone.value}
        onToggle={model.toggle}
        onLeave={() => p().onLeave?.()}
      />
    </div>
  )
}
