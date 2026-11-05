import { state } from '@weft-js/core'
import { Button, Card, MeetingRoom } from '@weft-js/warp'
import { CALL, CALL_SELF } from '../../world'
import { CHAT, SLIDE, INVITE } from './shared'

export function MeetingRoomIncident() {
  const left = state(false)
  return (
    <div style="block-size:560px">
      {left.value ? (
        <Card title="You left the incident review" sweep={false}>
          <Button onClick={() => (left.value = false)}>Rejoin</Button>
        </Card>
      ) : (
        <MeetingRoom
          title="Incident review"
          timer="12:48"
          recording
          participants={CALL}
          self={CALL_SELF}
          presenter="Sam"
          shareTitle="Incident timeline"
          share={SLIDE}
          chat={CHAT}
          invite={INVITE}
          onLeave={() => (left.value = true)}
        />
      )}
    </div>
  )
}
