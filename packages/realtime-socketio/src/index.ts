// Cursors through a Socket.IO relay you already run, for apps moving off one. The relay (`./relay`) checks the ticket the
// room signed, and stamps every frame with the ticket's subject, so a client can't speak as anyone else.

import { createRoot, derived, state, untrack } from '@weft-js/core'
import { io, type Socket } from 'socket.io-client'
import type { PeerLink, PeerRoom, PeerTransport } from '@weft-js/multiplayer'

/** Options of `socketio()`. */
export interface SocketIoOptions {
  /** The relay. */
  url: string
  path?: string
}

/** A peer transport through a Socket.IO relay, for `presence(conn, { transport })`. */
export function socketio({ url, path }: SocketIoOptions): PeerTransport {
  return {
    name: 'socketio',
    open(room: PeerRoom): PeerLink {
      return createRoot(dispose => {
        const joined = state(false)
        const socket: Socket = io(url, { ...(path === undefined ? {} : { path }), auth: { ticket: room.ticket }, transports: ['websocket'] })
        socket.on('weft:ok', () => { joined.value = true })
        socket.on('disconnect', () => { joined.value = false })
        socket.on('weft:f', (from: unknown, text: unknown) => { if (typeof from === 'string' && typeof text === 'string') room.receive(from, text) })
        return {
          up: derived(() => joined.value && room.peers.value.length > 0),
          send: text => { if (untrack(() => joined.value)) socket.volatile.emit('weft:f', text) },
          close() {
            socket.disconnect()
            dispose()
          },
        }
      })
    },
  }
}
