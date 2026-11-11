// The job queue on Redis: `defineJobs(jobs, { queue: redisQueue() })`. Jobs survive a restart, and every instance
// works the same queue, each job claimed by one at a time.

import type { DeadJob, Queue, QueuedJob } from '@weft-js/start/jobs'
import { connect, type RedisStoreOptions } from './store'

// The job's JSON is stored as given and never decoded in Lua (cjson would turn an empty array into an object):
// attempts and keys live in hashes of their own.
// KEYS: jobs (id → JSON), ready (sorted set by run-at ms), attempts (id → n), keyOf (id → key), key prefix, dead (list).

// ARGV: id, JSON, run-at, key ('' for none).
const PUSH = `
if ARGV[4] ~= '' then
  if not redis.call('SET', KEYS[5] .. ARGV[4], ARGV[1], 'NX') then return 0 end
  redis.call('HSET', KEYS[4], ARGV[1], ARGV[4])
end
redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
redis.call('ZADD', KEYS[2], ARGV[3], ARGV[1])
return 1
`
// Due jobs move their run-at to the lease's end, so no other instance claims them meanwhile, and count one attempt.
// ARGV: now, lease, max. Returns JSON, attempt, JSON, attempt, ...
const CLAIM = `
local ids = redis.call('ZRANGEBYSCORE', KEYS[2], '-inf', ARGV[1], 'LIMIT', 0, tonumber(ARGV[3]))
local out = {}
for _, id in ipairs(ids) do
  local raw = redis.call('HGET', KEYS[1], id)
  if raw then
    redis.call('ZADD', KEYS[2], tonumber(ARGV[1]) + tonumber(ARGV[2]), id)
    out[#out + 1] = raw
    out[#out + 1] = redis.call('HINCRBY', KEYS[3], id, 1)
  else
    redis.call('ZREM', KEYS[2], id)
  end
end
return out
`
// ARGV: id, dead JSON ('' when it ran), dead limit.
const DROP = `
local key = redis.call('HGET', KEYS[4], ARGV[1])
if key then redis.call('DEL', KEYS[5] .. key) end
redis.call('HDEL', KEYS[1], ARGV[1])
redis.call('ZREM', KEYS[2], ARGV[1])
redis.call('HDEL', KEYS[3], ARGV[1])
redis.call('HDEL', KEYS[4], ARGV[1])
if ARGV[2] ~= '' then
  redis.call('LPUSH', KEYS[6], ARGV[2])
  redis.call('LTRIM', KEYS[6], 0, tonumber(ARGV[3]) - 1)
end
return 1
`

/** Options of `redisQueue()`. */
export interface RedisQueueOptions extends RedisStoreOptions {
  /** How many dead jobs to keep (newest first, in `<prefix>q:dead`). Default 1000. */
  deadLimit?: number
}

/**
 * The job queue on Redis. Jobs are JSON (inputs must be too), due ones in a sorted set by when they may run; a
 * claim moves a job's time to its lease's end, so if its instance dies it's due again then.
 */
export function redisQueue(
  options: RedisQueueOptions = {},
): Queue & { dead(count?: number): Promise<DeadJob[]> } {
  const prefix = `${options.prefix ?? 'weft:'}q:`
  const client = connect(options, 'redisQueue')
  const keys = ['jobs', 'ready', 'attempts', 'keyOf', 'key:', 'dead'].map((k) => prefix + k)
  const deadLimit = options.deadLimit ?? 1000
  const drop = (job: QueuedJob, dead: string) =>
    client().eval(DROP, 6, ...keys, job.id, dead, deadLimit)
  return {
    async push(job, key) {
      const { attempt: _attempt, runAt: _runAt, ...stored } = job
      const added = await client().eval(
        PUSH,
        6,
        ...keys,
        job.id,
        JSON.stringify(stored),
        job.runAt,
        key ?? '',
      )
      return added === 1
    },
    async claim(now, lease, max) {
      const raw = (await client().eval(CLAIM, 6, ...keys, now, lease, max)) as (string | number)[]
      const out: QueuedJob[] = []
      for (let i = 0; i < raw.length; i += 2) {
        const job = JSON.parse(raw[i] as string) as Omit<QueuedJob, 'attempt' | 'runAt'>
        out.push({ ...job, attempt: Number(raw[i + 1]), runAt: now })
      }
      return out
    },
    async done(job) {
      await drop(job, '')
    },
    async retry(job, runAt) {
      await client().zadd(keys[1]!, 'XX', runAt, job.id)
    },
    async fail(job, error) {
      await drop(job, JSON.stringify({ ...job, error, at: Date.now() } satisfies DeadJob))
    },
    async dead(count = 100) {
      const raw = await client().lrange(keys[5]!, 0, count - 1)
      return raw.map((r) => JSON.parse(r) as DeadJob)
    },
  }
}
