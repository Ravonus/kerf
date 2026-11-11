// socketio() for kerf.config.ts: no slot, since a page passes the transport to `presence`.
import { definePlugin } from '@kerf/core/plugin'

export const socketio = definePlugin({
  name: '@kerf/realtime-socketio',
  version: '0.1.0',
  kerf: '*',
  permissions: { net: ['browser:socketio-relay'] },
  contribute: () => ({
    agents: {
      title: 'Peer transport (Socket.IO)',
      text: '`presence(conn, { transport: socketio({ url }) })` sends cursors through your relay. Run `relay(io, { secret })` from `@kerf/realtime-socketio/relay` there, and pass `ticket: socketioTicket({ secret })`, from the same file, to `multiplayer()`. For migrations: with no relay already running, leave it out.',
    },
  }),
})

export default socketio
