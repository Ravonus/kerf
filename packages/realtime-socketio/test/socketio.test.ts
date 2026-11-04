// A real Socket.IO server and real clients, through the transport suite.
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import { Server } from 'socket.io'
import { transportSuite } from '@weft-js/multiplayer/test'
import { relay, socketioTicket } from '../src/relay'
import { socketio } from '../src/index'

const secret = 'test-secret'

async function server() {
  const http = createServer()
  const io = new Server(http)
  relay(io, { secret })
  await new Promise<void>((ok) => {
    http.listen(0, ok)
  })
  return { io, url: `http://127.0.0.1:${(http.address() as AddressInfo).port}` }
}

test("passes the transport suite, and the sender is the ticket's", async () => {
  const { io, url } = await server()
  const ticket = socketioTicket({ secret })
  const checks = await transportSuite({
    make: () => socketio({ url }),
    ticket: (peer) => ticket({ id: peer, params: { room: 1 } }),
  })
  await io.close()
  expect(checks.filter((c) => !c.ok)).toEqual([])
  expect(checks).toHaveLength(5)
})

test('a connection with no good ticket is refused', async () => {
  const { io, url } = await server()
  const { io: client } = await import('socket.io-client')
  const error = await new Promise<Error>((ok) => {
    client(url, { auth: { ticket: 'forged' }, transports: ['websocket'] }).on('connect_error', ok)
  })
  await io.close()
  expect(error.message).toBe('bad ticket')
})
