// The server's realtime hub (research 30 §5). No runtime imports, so one hub runs behind `/_weft/rt` and behind
// @weft-js/core/test's fake transport: both hand it a sink, and only the HTTP sink knows about bytes.
//
//   rings        one for pokes, always listening, so a rendered page's cursor can replay the gap before it connects;
//                one per topic channel, alive while someone listens and one window longer. Cursors are
//                `<epoch>:<seq>`: another epoch, or one older than a ring's floor, is out of the window.
//   connections  one per tab, changed in place (`k`), so adding a subscription never restarts another's `run`.
//   backpressure past the high-water mark a subscription holds its last message, or up to `buffer`; pokes merge by tag.
//                A buffer that overflows resets that stream; a connection over `queue` bytes is closed, and resumes.

import { memoryBus } from './bus'
import { StartError, type StandardSchemaV1 } from './data'
import type { Scope } from './exec'
import { createChannels } from './hub/channels'
import { createConnections } from './hub/connections'
import { createDelivery } from './hub/delivery'
import { createFeedState } from './hub/feed'
import { createPresence } from './hub/presence'
import { handleRoute } from './hub/route'
import { createSubscriptions } from './hub/subscriptions'
import { makeTopic, type Topic } from './hub/topic'
import type { Conn, Hub, HubOptions, Limits, LiveState, RealtimeOptions } from './hub/types'
import { createHubView } from './hub/view'

export { validBody } from './hub/route'
export { Tracked, tracked } from './hub/tracked'
export type {
  Limits,
  RealtimeOptions,
  HubOptions,
  LiveState,
  Sink,
  SubEntry,
  Body,
  Ev,
  Channel,
  Conn,
  Hub,
} from './hub/types'

const LIMITS: Limits = {
  subscriptions: 100,
  connections: 10,
  body: 64 * 1024,
  message: 1 << 20,
  queue: 1 << 20,
  ring: 256,
  window: 60_000,
  heartbeat: 20_000,
  session: 300_000,
  perSecond: 20,
  burst: 40,
  shareKeys: 1000,
}

/** `src/realtime.server.ts`'s default export. */
export function realtime(options: RealtimeOptions): RealtimeOptions {
  checkOrigins(options.origins)
  return options
}

/** R004. `realtime()` is a wrapper an app can leave out, so the upgrade calls this too. */
export function checkOrigins(origins: string[] = []) {
  if (origins.some((o) => o.includes('*')))
    throw new StartError(
      'R004',
      "`realtime({ origins })` has a wildcard: any site could read this app's streams and join its channels with a visitor's cookies",
      'list the origins, scheme and port included',
    )
}

/** A hub on these options; `hub()` is the usual way to reach the one a server made. */
export function createHub(options: HubOptions): Hub {
  const bus = options.bus ?? memoryBus()
  const limits = { ...LIMITS, ...options.limits }
  const epoch = crypto.randomUUID().slice(0, 8)
  const { channels, channel, unlisten, replay, seq } = createChannels(bus, limits, epoch)
  const conns = new Map<string, Conn>()
  const watchers = new Set<(tags: string[]) => void>()
  const closing = new Set<() => void>()
  const cursorOf = (n: number) => `${epoch}:${n}`
  const { poke, deliver, drain } = createDelivery(limits, cursorOf, (c, retry) =>
    connections.bye(c, retry),
  )
  const source = options.changes
  const { fail, change } = createSubscriptions({ limits, source, deliver })
  const presence = createPresence({
    channels,
    channel,
    conns,
    watchers,
    cursorOf,
    seq,
    poke,
    replay,
    heartbeat: () => feedState.heartbeat(),
  })
  const { pokes, replayPokes } = presence
  const feedState = createFeedState(options, limits, conns, pokes)
  const { want, rest, wire, probed, feed } = feedState
  const connections = createConnections({
    conns,
    limits,
    epoch,
    options,
    source,
    pokes,
    want,
    rest,
    cursorOf,
    seq,
    wire,
    change,
    replayPokes,
    fail,
  })
  const { connect, close } = connections

  return createHubView({
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
    want,
    rest,
    feedState,
    feed,
    probed,
    deliver,
    drain,
    connect,
    close,
    change,
  })
}

let current: Hub | undefined
/** The process's hub: the first caller makes the default one (memory bus). */
export const hub = (): Hub => (current ??= createHub({}))
/** Set by `createHandler`, from `src/realtime.server.ts`. */
export const configure = (options: HubOptions) => {
  void current?.shutdown() // a dev server's reload makes a new handler
  return (current = createHub(options))
}
/** This instance's connections, subscriptions and listened channels: for a health route. */
export const realtimeStats = () => hub().stats()
/**
 * For a health route: `ok` is false when required live queries have no working feed, now or at startup. A server that
 * started fine and lost its database mid-flight keeps running, and says so here: restarting it wouldn't bring the
 * database back, and it recovers by itself.
 */
export function liveHealth(): LiveState & { ok: boolean; required: boolean } {
  const h = hub(),
    s = h.live(),
    required = h.required
  return {
    ...s,
    required,
    ok: !required || ((s.mode === 'feed' || s.mode === 'external') && !s.down),
  }
}
/** @weft-js/core/test, after each test. */
export const resetHub = () => {
  const old = current
  current = undefined
  return old?.shutdown()
}

export type { Topic } from './hub/topic'
type Out<S> = S extends StandardSchemaV1<unknown, infer O> ? O : never
/** A typed server channel: mutations, jobs and webhooks publish, streams read. */
export function topic<
  K extends StandardSchemaV1<unknown, string | number>,
  M extends StandardSchemaV1,
>(name: string, def: { key?: K; message: M }): Topic<Out<K>, Out<M>> {
  return makeTopic(name, def, hub)
}

/** `/_weft/rt` opens a connection or changes one. */
export async function rtRoute(
  request: Request,
  scope: Scope,
  origins: string[] = [],
): Promise<Response> {
  return handleRoute(request, scope, origins, hub)
}
