// A Durable Object per channel (research 32 §6). `KerfBusObject` holds the sockets, through the hibernation API, and
// nothing else: a publish is a POST it writes to all of them. A hub's subscribe is a WebSocket to the object, and a
// lost one is a `gap`. No runtime imports, so workerd can run this file as it is.
//
// A Worker's I/O belongs to the request that opened it, so a stateless Worker can't hold that socket: this needs a hub
// that lives in a Durable Object, Nitro's `cloudflare_durable` preset (`kerf build` refuses the others, R002).

import type { Bus } from '@kerf-js/start/bus'

/** The parts of Workers' API used here, so an app doesn't need `@cloudflare/workers-types` for this file. */
interface Stub {
  fetch(url: string, init?: RequestInit): Promise<Response & { webSocket?: CfSocket | null }>
}
/** A Durable Object namespace binding, as far as the bus uses one: `env.KERF_BUS` fits it. */
export interface DurableObjectNamespaceLike {
  idFromName(name: string): unknown
  get(id: unknown): Stub
}
interface CfSocket {
  accept(): void
  send(m: string): void
  close(code?: number): void
  addEventListener(t: string, f: (e: { data?: unknown }) => void): void
}
interface CfState {
  acceptWebSocket(ws: CfSocket): void
  getWebSockets(): CfSocket[]
}
declare const WebSocketPair: new () => [CfSocket, CfSocket]

const BASE = 'https://kerf-bus/'

/** Export it from the worker entry and bind it: `new_sqlite_classes: ['KerfBusObject']`, binding `KERF_BUS`. */
export class KerfBusObject {
  constructor(
    private state: CfState,
    _env?: unknown,
  ) {}

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('upgrade')?.toLowerCase() === 'websocket') {
      const pair = new WebSocketPair()
      this.state.acceptWebSocket(pair[1])
      return new Response(null, { status: 101, webSocket: pair[0] } as ResponseInit)
    }
    const message = await request.text()
    for (const ws of this.state.getWebSockets()) {
      try {
        ws.send(message)
      } catch {} // a socket mid-close: its own `gap` covers it
    }
    return new Response(null, { status: 204 })
  }

  webSocketMessage() {}
  webSocketClose(ws: CfSocket) {
    try {
      ws.close(1000)
    } catch {}
  }
}

/** The `realtime.bus` for `src/realtime.server.ts`: one `KerfBusObject` per channel, which must be reached from a Durable Object hub. */
export function durableObjectBus({ namespace }: { namespace: DurableObjectNamespaceLike }): Bus {
  const stub = (channel: string) => namespace.get(namespace.idFromName(channel))
  const open = new Set<() => void>()
  return {
    name: 'durable-object',
    async publish(channel, message) {
      const res = await stub(channel).fetch(BASE, { method: 'POST', body: message })
      if (!res.ok) throw new Error(`durable object bus: publish answered ${res.status}`)
    },
    async subscribe(channel, on, gap) {
      let stopped = false,
        attempt = 0,
        ws: CfSocket | undefined
      const dial = async (): Promise<void> => {
        const res = await stub(channel).fetch(BASE, { headers: { upgrade: 'websocket' } })
        ws = res.webSocket ?? undefined
        if (!ws) throw new Error(`durable object bus: subscribe answered ${res.status}`)
        ws.accept()
        if (stopped) return ws.close(1000) // stopped while this redial was out
        ws.addEventListener('message', (e) => on(String(e.data)))
        const lost = () => {
          ws = undefined
          if (stopped) return
          gap?.()
          setTimeout(
            () =>
              void dial().then(() => {
                attempt = 0
              }, lost),
            Math.min(30_000, 500 * 2 ** attempt++),
          )
        }
        ws.addEventListener('close', lost)
        ws.addEventListener('error', () => {})
      }
      await dial()
      const stop = () => {
        stopped = true
        open.delete(stop)
        try {
          ws?.close(1000)
        } catch {}
      }
      open.add(stop)
      return stop
    },
    close() {
      for (const stop of open) stop()
      return Promise.resolve()
    },
  }
}
