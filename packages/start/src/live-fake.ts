// @weft-js/core/test's realtime transport (research 30 §7): the real hub, a memory bus, frames through JSON.

import { fakeScope, FnError, net, runtime } from './data'
import type { Body } from './hub'

export async function change(body: Body) {
  const [{ hub }, exec] = await Promise.all([import('./hub'), (runtime.exec ??= await import('./exec'))])
  const c = hub().find(body.k!)
  if (!c) throw new FnError({}, 404)
  const request = new Request('http://localhost/_weft/rt', { method: 'POST' })
  await hub().change(c, request, fakeScope(exec, net()!, request).options, body)
}

export async function open(body: Body, frame: (event: string, data: any) => void, signal: AbortSignal, up: () => void, subs: Map<string, any>, closing: (close: () => unknown) => void) {
  const n = net()!
  const [{ hub, resetHub }, exec] = await Promise.all([import('./hub'), (runtime.exec ??= await import('./exec'))])
  if (!n.online()) throw Object.assign(new Error('offline'), { name: 'OfflineError' })
  closing(resetHub)
  const h = hub()
  runtime.poke ??= (tags, origin) => hub().poke(tags, origin)
  const request = new Request('http://localhost/_weft/rt', { method: 'POST' })
  return new Promise<void>((done, fail) => {
    let conn: any
    const sink = { write: (e: string, d: string) => frame(e, JSON.parse(d)), backlog: () => 0, close: () => done() }
    n.rt = {
      push: (id, msg) => h.push(id, msg),
      poke: tags => h.poke(tags),
      drop: () => conn && h.close(conn),
      subscriptions: () => [...subs.values()].map(s => ({ kind: s.fn.kind, id: s.fn.$id, input: s.input })),
    }
    signal.addEventListener('abort', () => (conn ? h.close(conn) : done()))
    h.connect(request, fakeScope(exec, n, request), body, sink).then(c => {
      conn = c
      if (signal.aborted) h.close(c)
      up()
    }, fail)
  })
}
