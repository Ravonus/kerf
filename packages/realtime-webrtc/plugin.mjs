// webrtc() for kerf.config.ts: no slot, since a page passes the transport to `presence`. Listed, what it reaches is on
// the record. A browser talks to STUN, TURN and peers directly, and none of that goes through the server.
import { definePlugin } from '@kerf/core/plugin'

export const webrtc = definePlugin({
  name: '@kerf/realtime-webrtc',
  version: '0.1.0',
  kerf: '*',
  permissions: { net: ['browser:peers', 'browser:ice-servers'] },
  contribute: () => ({
    agents: {
      title: 'Peer transport (WebRTC)',
      text: '`presence(conn, { transport: webrtc({ iceServers }) })` sends cursors directly between browsers, and the socket carries them until every peer is connected. Only cursors ride it: state and the relay stay on the server, which checks them.',
    },
  }),
})

export default webrtc
