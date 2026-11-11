// Cursors over a LiveKit room. `ticket` from the server is the token, and LiveKit proves a frame's sender: a participant's
// identity is the connection the room signed it for. The room is there for audio and video too: `link.room`.

import { createRoot, derived, state, untrack } from '@kerf-js/core'
import { Room, RoomEvent } from 'livekit-client'
import type { PeerLink, PeerRoom, PeerTransport } from '@kerf-js/multiplayer'

const TOPIC = 'kerf'

/** Options of `livekit()`. */
export interface LivekitOptions {
  /** `wss://…` */
  url: string
}

/** A peer transport over a LiveKit room, for `presence(conn, { transport })`. The link's `room` carries audio and video too. */
export function livekit({ url }: LivekitOptions): PeerTransport {
  return {
    name: 'livekit',
    open(room: PeerRoom): PeerLink & { room: Room } {
      return createRoot((dispose) => {
        const live = new Room()
        const here = state<string[]>([])
        const sync = () => {
          here.value = [...live.remoteParticipants.values()].map((p) => p.identity)
        }
        const decoder = new TextDecoder(),
          encoder = new TextEncoder()
        live.on(RoomEvent.DataReceived, (bytes, participant, _kind, topic) => {
          if (topic === TOPIC && participant)
            room.receive(participant.identity, decoder.decode(bytes))
        })
        for (const e of [
          RoomEvent.ParticipantConnected,
          RoomEvent.ParticipantDisconnected,
          RoomEvent.Connected,
          RoomEvent.Disconnected,
        ])
          live.on(e, sync)
        if (room.ticket) void live.connect(url, room.ticket as string).then(sync, () => {})
        return {
          room: live,
          up: derived(() => {
            const ids = room.peers.value
            return ids.length > 0 && ids.every((id) => here.value.includes(id))
          }),
          send(text) {
            if (untrack(() => here.value.length))
              void live.localParticipant
                .publishData(encoder.encode(text), { reliable: false, topic: TOPIC })
                .catch(() => {})
          },
          close() {
            void live.disconnect()
            dispose()
          },
        }
      })
    },
  }
}
