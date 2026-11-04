import type { Bus } from '../bus'
import type { createChannels } from './channels'
import type { createConnections } from './connections'
import type { createDelivery } from './delivery'
import type { createFeedState } from './feed'
import type { createSubscriptions } from './subscriptions'
import type { Channel, Conn, Hub, HubOptions, Limits } from './types'

const unref = <T>(t: T) => ((t as { unref?(): void } | null | undefined)?.unref?.(), t)
interface View {
  bus: Bus
  limits: Limits
  epoch: string
  options: HubOptions
  channels: Map<string, Channel>
  conns: Map<string, Conn>
  watchers: Set<(tags: string[]) => void>
  closing: Set<() => void>
  cursorOf: (n: number) => string
  channel: ReturnType<typeof createChannels>['channel']
  replay: ReturnType<typeof createChannels>['replay']
  unlisten: ReturnType<typeof createChannels>['unlisten']
  seq: () => number
  pokes: () => Channel
  want: ReturnType<typeof createFeedState>['want']
  rest: ReturnType<typeof createFeedState>['rest']
  feedState: ReturnType<typeof createFeedState>
  feed: ReturnType<typeof createFeedState>['feed']
  probed: Promise<unknown>
  deliver: ReturnType<typeof createDelivery>['deliver']
  drain: ReturnType<typeof createDelivery>['drain']
  connect: ReturnType<typeof createConnections>['connect']
  close: ReturnType<typeof createConnections>['close']
  change: ReturnType<typeof createSubscriptions>['change']
}

export function createHubView(deps: View): Hub {
  const {
    bus,
    limits,
    epoch,
    options,
    channels,
    conns,
    watchers,
    closing,
    cursorOf,
    channel,
    replay,
    unlisten,
    seq,
    pokes,
    feedState,
    probed,
    drain,
    connect,
    close,
    change,
  } = deps
  const { ready, poke, push, shutdown } = createOperations(deps)
  return {
    bus,
    limits,
    cursorOf,
    channel,
    replay,
    unlisten,
    connect,
    change,
    drain,
    close,
    closing,
    epoch,
    dev: options.dev,
    maxDuration: options.maxDuration,
    build: options.build,
    share: options.share,
    position: () => cursorOf(seq()),
    watch(fn) {
      watchers.add(fn)
      void pokes()
    },
    find: (k) => conns.get(k),
    connections: () => [...conns.values()],
    cursor: () => (pokes().stop ? cursorOf(seq()) : undefined),
    ready,
    poke,
    push,
    stats: () => ({
      connections: conns.size,
      subscriptions: [...conns.values()].reduce((n, c) => n + c.subs.size, 0),
      channels: channels.size,
    }),
    live: feedState.live,
    probed,
    required: !!options.required?.length,
    get refused() {
      return feedState.refused()
    },
    shutdown,
  }
}

function createOperations(deps: View) {
  const { want, rest, pokes, feedState, feed, bus, conns, deliver, closing, close, channels } = deps
  return {
    ready: () => {
      const on = Promise.resolve(want()).then(rest)
      return Promise.race([
        Promise.all([pokes().ready.catch(() => {}), on]),
        new Promise((ok) => {
          unref(setTimeout(ok, 250))
        }),
      ])
    },
    async poke(tags: string[], origin?: string | null) {
      if (!tags.length) return
      // In this order: a client's refetch must start after what the barrier claims is covered.
      if (feedState.live().mode === 'feed' || feedState.live().mode === 'external')
        await feed?.settle(tags)
      await bus.publish('weft:poke', JSON.stringify({ t: tags, ...(origin && { o: origin }) }))
    },
    push(id: string, msg: unknown) {
      let hit = 0
      for (const c of conns.values()) {
        for (const s of c.subs.values()) {
          if (s.fn.$id !== id) continue
          hit++
          deliver(c, s, JSON.stringify([s.n, null, msg]))
        }
      }
      return hit
    },
    async shutdown() {
      feedState.clear()
      await feed?.stop()
      for (const fn of closing) fn()
      for (const c of conns.values()) close(c)
      for (const ch of channels.values()) {
        clearTimeout(ch.idle)
        ch.stop?.()
      }
      channels.clear()
      await bus.close?.()
    },
  }
}
