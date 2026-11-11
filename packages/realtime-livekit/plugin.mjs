// livekit() for kerf.config.ts: no slot, since a page passes the transport to `presence`.
import { definePlugin } from '@kerf-js/core/plugin'

export const livekit = definePlugin({
  name: '@kerf-js/realtime-livekit',
  version: '0.1.0',
  kerf: '*',
  permissions: { net: ['browser:livekit'], env: ['LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET'] },
  contribute: () => ({
    agents: {
      title: 'Peer transport (LiveKit)',
      text: '`presence(conn, { transport: livekit({ url }) })` sends cursors through LiveKit, and `link.room` is the room for audio and video. Pass `ticket: livekitTicket({ media })` from `@kerf-js/realtime-livekit/server` to `multiplayer()`, with `LIVEKIT_API_KEY` and `LIVEKIT_API_SECRET` on the server.',
    },
  }),
})

export default livekit
