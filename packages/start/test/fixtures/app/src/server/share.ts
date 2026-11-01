// PROTOTYPE (research 40): the room behind `share`. In the spec this is one `realtime({ share })` function, built in.
import { channel } from '@weft/start'
import { shareRoom } from '../../../../../src/share-server'

export const shared = channel({
  params: shareRoom.params,
  authorize: ({ params }) => !params.key.startsWith('secret:'),
  client: shareRoom.client,
  server: shareRoom.server,
  on: shareRoom.on,
  left: shareRoom.left,
})
