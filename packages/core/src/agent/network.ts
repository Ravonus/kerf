import { real, settle, sleep } from './real'

const g = globalThis as unknown as Record<string, unknown>
let log: (step: { kind: 'net'; op: 'offline' | 'online' }) => void = () => {}
export function setNetworkLog(fn: typeof log) {
  log = fn
}

const sockets = new Set<WebSocket | EventSource>()
const netState = { online: true, latency: 0 }

/**
 * The network as the app sees it: `offline()` makes `navigator.onLine` false, fires `offline`, fails `fetch` and new
 * sockets, and drops open WebSockets and EventSources; `latency(ms)` delays every `fetch`; `drop()` closes the open
 * sockets without going offline (a server restart). Same words as @kerf/core/test's `net`. The dev server's own socket is
 * never touched.
 */
export const net = {
  status: () => ({ ...netState, sockets: sockets.size }),
  async offline() {
    netState.online = false
    net.drop()
    dispatchEvent(new Event('offline'))
    await settle()
    log({ kind: 'net', op: 'offline' })
    return net.status()
  },
  async online() {
    netState.online = true
    dispatchEvent(new Event('online'))
    await settle()
    log({ kind: 'net', op: 'online' })
    return net.status()
  },
  latency(ms: number) {
    netState.latency = Math.max(0, ms)
    return net.status()
  },
  drop() {
    for (const s of sockets) {
      if (s instanceof real.WebSocket) s.close(4000, 'kerf: connection dropped')
      else {
        s.close()
        s.dispatchEvent(new Event('error'))
      }
    }
    sockets.clear()
    return net.status()
  },
  reset() {
    netState.online = true
    netState.latency = 0
    return net.status()
  },
}

export function patchNetwork() {
  Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => netState.online })
  if (real.fetch)
    g.fetch = async (...args: Parameters<typeof fetch>) => {
      if (netState.latency) await sleep(netState.latency)
      if (!netState.online) throw new TypeError('Failed to fetch (kerf: offline)')
      return real.fetch(...args)
    }
  if (real.WebSocket)
    g.WebSocket = class extends real.WebSocket {
      constructor(url: string | URL, protocols?: string | string[]) {
        super(url, protocols)
        if (!netState.online) {
          real.setTimeout(() => {
            this.dispatchEvent(new Event('error'))
            this.close(4000, 'kerf: offline')
          }, 0)
          return
        }
        sockets.add(this)
        this.addEventListener('close', () => sockets.delete(this))
      }
    }
  if (real.EventSource)
    g.EventSource = class extends real.EventSource {
      constructor(url: string | URL, init?: EventSourceInit) {
        super(url, init)
        if (!netState.online) {
          real.setTimeout(() => {
            this.close()
            this.dispatchEvent(new Event('error'))
          }, 0)
          return
        }
        sockets.add(this)
      }
    }
}
