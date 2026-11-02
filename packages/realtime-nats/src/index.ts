// Core NATS (research 32 §6): at-most-once, like every bus. Channels come from tags and keys, and a subject can't hold
// `*`, `>` or a space, so a subject is `weft.<base64url of the channel>`. A reconnect is the `gap`.

import { connect, type NatsConnection } from '@nats-io/transport-node'
import type { Bus } from '@weft-js/start/bus'
import { StartError } from '@weft-js/start/data'

export interface NatsBusOptions {
  /** `nats://host:4222`, or several. */
  servers: string | string[]
  token?: string
  user?: string
  pass?: string
}

const subject = (channel: string) => `weft.${Buffer.from(channel).toString('base64url')}`

export function natsBus(options: NatsBusOptions): Bus {
  if (!options.servers?.length && process.env.WEFT_BUILD) options = { ...options, servers: 'nats://localhost:4222' } // a build never connects
  if (!options.servers?.length)
    throw new StartError('Q013', '`natsBus` needs `servers`', 'set the URL, or leave `bus` out for the memory bus on one instance')
  let nc: Promise<NatsConnection> | undefined
  const gaps = new Set<() => void>()
  const client = () => (nc ??= connect({ ...options, maxReconnectAttempts: -1, reconnectTimeWait: 500 }).then(c => {
    void (async () => {
      for await (const s of c.status()) if (s.type === 'reconnect') for (const gap of gaps) gap()
    })()
    return c
  }, e => {
    nc = undefined // the next use tries again
    throw e
  }))
  return {
    name: 'nats',
    async publish(channel, message) {
      (await client()).publish(subject(channel), message)
    },
    async subscribe(channel, on, gap) {
      const c = await client()
      const sub = c.subscribe(subject(channel), { callback: (e, m) => { if (!e) on(m.string()) } })
      await c.flush() // the server has the subscription: a publish after this resolves is delivered
      if (gap) gaps.add(gap)
      return () => {
        sub.unsubscribe()
        if (gap) gaps.delete(gap)
      }
    },
    async close() {
      const c = await nc?.catch(() => undefined)
      nc = undefined
      await c?.close()
    },
  }
}

/** The `realtime.bus` provider: `NATS_URL` unless the plugin was given `servers`. */
export const bus = (options: Partial<NatsBusOptions> = {}) => natsBus({ ...options, servers: options.servers ?? process.env.NATS_URL ?? '' })
