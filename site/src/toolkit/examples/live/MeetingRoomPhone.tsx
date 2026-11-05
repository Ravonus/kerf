import { MeetingRoom } from '@weft-js/warp'
import { CALL, CALL_SELF } from '../../world'
import { CHAT } from './shared'

export const MeetingRoomPhone = () => (
  <div style="block-size:620px">
    <MeetingRoom
      compact
      title="Incident review"
      timer="12:48"
      participants={CALL}
      self={CALL_SELF}
      chat={CHAT}
    />
  </div>
)
