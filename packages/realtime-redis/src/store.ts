// The shared cache and auth's rate limit on Redis: every server instance reads the same values, so a mutation's
// invalidation on one reaches them all, and sign-in attempts count once however many servers there are.

import { Redis } from 'ioredis'
import type { Store, Stored } from '@weft-js/start/cache'
import { StartError } from '@weft-js/start/data'

/** Options of `redisStore()` and `redisRateLimit()`. */
export interface RedisStoreOptions {
  /** `redis://…` or `rediss://…`. Default `REDIS_URL`. */
  url?: string
  /** Prefix of every key. Default `weft:`: several apps can share a server. */
  prefix?: string
}

function connect(options: RedisStoreOptions, what: string) {
  let url = options.url ?? process.env.REDIS_URL ?? ''
  if (!url && process.env.WEFT_BUILD) url = 'redis://localhost' // a build loads this module and never connects
  if (!/^rediss?:\/\//.test(url))
    throw new StartError(
      'Q013',
      `\`${what}\` needs a \`redis://\` URL, not \`${url.replace(/\/\/.*@/, '//…@')}\``,
      'set `REDIS_URL`, or pass `url`',
    )
  let client: Redis | undefined
  return () => {
    if (client) return client
    client = new Redis(url, { maxRetriesPerRequest: 2, lazyConnect: false })
    client.on('error', () => {}) // ioredis retries; an unhandled `error` event would end the process
    return client
  }
}

// A tag's version comes from one counter that never repeats. A tag Redis doesn't have (never bumped, or evicted)
// gets a fresh number, so no stored value can match it: an evicted tag costs a miss, never a stale answer.
const VERSIONS = `
local out = {}
for i, key in ipairs(KEYS) do
  local v = redis.call('GET', key)
  if not v then
    v = redis.call('INCR', ARGV[1])
    redis.call('SET', key, v, 'NX')
    v = redis.call('GET', key)
  end
  out[i] = tonumber(v)
end
return out
`
const BUMP = `
for _, key in ipairs(KEYS) do redis.call('SET', key, redis.call('INCR', ARGV[1])) end
return 0
`

const CONSUME = `
local n = redis.call('INCR', KEYS[1])
if n == 1 then redis.call('EXPIRE', KEYS[1], ARGV[1]) end
if n > tonumber(ARGV[2]) then return redis.call('TTL', KEYS[1]) end
return -1
`

/** One call against `key` in a fixed window, on Redis: what `redisStore().consume` and `redisRateLimit()` share. */
async function count(client: Redis, key: string, rule: { window: number; max: number }) {
  const wait = (await client.eval(
    CONSUME,
    1,
    key,
    Math.max(1, Math.ceil(rule.window)),
    rule.max,
  )) as number
  return wait < 0
    ? { allowed: true, retryAfter: null }
    : { allowed: false, retryAfter: Math.max(1, wait) }
}

/**
 * The shared cache on Redis: `export default redisStore()` in `src/cache.server.ts`. Values are JSON (what a query
 * already sends), kept until their `life` runs out; tags are versioned in Redis, so every instance sees a bump.
 */
export function redisStore(options: RedisStoreOptions = {}): Store {
  const prefix = options.prefix ?? 'weft:'
  const client = connect(options, 'redisStore')
  const value = (k: string) => `${prefix}c:${k}`
  const tag = (t: string) => `${prefix}t:${t}`
  const counter = `${prefix}t#`
  return {
    async get(k) {
      const raw = await client().get(value(k))
      return raw ? (JSON.parse(raw) as Stored) : undefined
    },
    async set(k, v) {
      const ms = Math.min(v.expires - Date.now(), 2 ** 31 - 1)
      if (ms > 0) await client().set(value(k), JSON.stringify(v), 'PX', Math.ceil(ms))
    },
    async versions(tags) {
      if (!tags.length) return []
      return (await client().eval(VERSIONS, tags.length, ...tags.map(tag), counter)) as number[]
    },
    async bump(tags) {
      if (tags.length) await client().eval(BUMP, tags.length, ...tags.map(tag), counter)
    },
    consume: (key, rule) => count(client(), `${prefix}rl:${key}`, rule),
  }
}

/**
 * Better Auth's rate limit on Redis, so every instance counts the same attempts:
 * `createAuth({ options: { rateLimit: { customStorage: redisRateLimit() } } })`. A fixed window per key.
 */
export function redisRateLimit(options: RedisStoreOptions = {}) {
  const prefix = options.prefix ?? 'weft:'
  const client = connect(options, 'redisRateLimit')
  return {
    consume: (key: string, rule: { window: number; max: number }) =>
      count(client(), `${prefix}rl:${key}`, rule),
  }
}
