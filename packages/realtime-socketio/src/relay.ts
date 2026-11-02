// The relay's half, for a Socket.IO server you run: `relay(io, { secret })`. A connection without a good ticket is refused,
// and a frame is fanned out with the ticket's subject as its sender.

import type { Server, Socket } from 'socket.io'
import { roomId, signTicket, verifyTicket } from '@weft-js/multiplayer/server'

const FRAME = 1024

export function relay(io: Server, { secret }: { secret: string }) {
  io.use(async (socket: Socket, next) => {
    const claims = await verifyTicket(socket.handshake.auth?.ticket, secret)
    if (!claims?.sub || !claims.room) return next(new Error('bad ticket'))
    socket.data = { peer: claims.sub, room: claims.room }
    next()
  })
  io.on('connection', async (socket: Socket) => {
    await socket.join(socket.data.room)
    socket.emit('weft:ok')
    socket.on('weft:f', (text: unknown) => {
      if (typeof text === 'string' && text.length <= FRAME) socket.to(socket.data.room).volatile.emit('weft:f', socket.data.peer, text)
    })
  })
}

export interface TicketOptions {
  /** Shared with the relay. */
  secret: string
  /** Seconds a ticket opens a connection. Default 3600. */
  ttl?: number
}

/** For `multiplayer({ ticket })`: a signed claim of who this connection is and which room it may enter. */
export const socketioTicket = ({ secret, ttl = 3600 }: TicketOptions) => async ({ id, params }: { id: string; params: unknown }) =>
  signTicket({ sub: id, room: await roomId(params), exp: Math.floor(Date.now() / 1000) + ttl }, secret)
