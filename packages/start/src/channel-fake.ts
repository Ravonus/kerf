// @weft-js/core/test's socket (research 32 §7): the real socket.ts and hub, a memory bus, frames through JSON.

import { fakeScope, fns, net, runtime, track } from './data'
import type { SocketLink } from './channel'

export async function open(frame: (d: any[]) => void, done: (code: number) => void, up: () => void): Promise<SocketLink> {
  const n = net()!
  const [{ hub, resetHub }, { attach, publish }, exec] = await Promise.all([import('./hub'), import('./socket'), (runtime.exec ??= await import('./exec'))])
  if (!n.online()) throw new Error('offline')
  if (!n.resets.includes(resetHub)) n.resets.push(resetHub)
  const h = hub()
  h.dev = true
  runtime.poke ??= (tags, origin) => hub().poke(tags, origin)
  const request = new Request('http://localhost/_weft/ws')
  const rooms = new Map<number, string>()
  const joining = new Map<number, () => void>()
  let closed = false
  const peer = {
    send(t: string) {
      const d = JSON.parse(t)
      frame(d)
      if (d[0] === 'j' || d[0] === 'e') joining.get(d[1])?.()
    },
    close(code: number) {
      if (closed) return
      closed = true
      n.ws = undefined
      for (const go of joining.values()) go()
      done(code)
    },
    backlog: () => 0,
  }
  const socket = await attach(peer, request, fakeScope(exec, n, request), h)
  n.ws = {
    publish: (id, params, name, msg) => publish(fns.get(id)!, params, name, msg),
    drop: () => { peer.close(1006); socket.close() }, // both ends, as a real cut: the server runs `left`
    recheck: () => socket.recheck(),
  }
  up()
  return {
    send(text) {
      const f = JSON.parse(text)
      if (f[0] === 'm') n.sent.push({ id: rooms.get(f[1]) ?? '', name: f[3], msg: f[4] })
      if (f[0] === 'j') {
        rooms.set(f[1], f[2])
        track(new Promise<void>(ok => joining.set(f[1], ok))) // `net.settle()` waits for the join's answer
      }
      socket.message(text)
    },
    close: () => socket.close(),
  }
}
