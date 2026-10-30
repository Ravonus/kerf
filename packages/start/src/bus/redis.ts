// Redis pub/sub (research 32 §6): two connections, because a subscriber can't publish. ioredis resubscribes after a
// reconnect, and whatever was published meanwhile is gone: every `ready` after the first is the `gap`.

import { Redis } from 'ioredis'
import type { Bus } from '../bus'
import { StartError } from '../data'

export interface RedisBusOptions {
  /** `redis://…` or `rediss://…`. */
  url: string
  /** Prefix of every Redis channel. Default `weft:`: several apps can share a server. */
  prefix?: string
}

export function redisBus({ url, prefix = 'weft:' }: RedisBusOptions): Bus {
  if (!url && process.env.WEFT_BUILD) url = 'redis://localhost' // a build loads this module and never connects
  if (!/^rediss?:\/\//.test(url ?? ''))
    throw new StartError('Q013', `\`redisBus\` needs a \`redis://\` URL, not \`${String(url).replace(/\/\/.*@/, '//…@')}\``, 'set the URL, or leave `bus` out for the memory bus on one instance')
  let pub: Redis | undefined, sub: Redis | undefined
  const listeners = new Map<string, Set<(message: string) => void>>()
  const gaps = new Set<() => void>()
  const opts = { maxRetriesPerRequest: null, lazyConnect: false }
  const subscriber = () => {
    if (sub) return sub
    let connected = false
    sub = new Redis(url, opts)
    sub.on('error', () => {}) // ioredis retries; an unhandled `error` event would end the process
    sub.on('ready', () => {
      if (connected) for (const gap of gaps) gap()
      connected = true
    })
    sub.on('message', (channel: string, message: string) => {
      const list = listeners.get(channel)
      if (list) for (const on of list) on(message)
    })
    return sub
  }
  const publisher = () => {
    if (pub) return pub
    pub = new Redis(url, opts)
    pub.on('error', () => {})
    return pub
  }
  return {
    name: 'redis',
    async publish(channel, message) {
      await publisher().publish(prefix + channel, message)
    },
    async subscribe(channel, on, gap) {
      const name = prefix + channel
      let list = listeners.get(name)
      if (!list) listeners.set(name, (list = new Set()))
      list.add(on)
      if (gap) gaps.add(gap)
      if (list.size === 1) await subscriber().subscribe(name)
      return () => {
        list.delete(on)
        if (gap) gaps.delete(gap)
        if (list.size) return
        listeners.delete(name)
        void sub?.unsubscribe(name).catch(() => {})
      }
    },
    async close() {
      sub?.disconnect()
      pub?.disconnect()
      sub = pub = undefined
    },
  }
}
