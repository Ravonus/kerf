// redisStore and redisRateLimit on a real server (`WEFT_TEST_REDIS` names a `redis-server` binary; without it they skip).
import { freePort } from '../../../scripts/lib/helpers.mjs'
import { spawn, type ChildProcess } from 'node:child_process'
import { redisRateLimit, redisStore } from '../src/index'

const binary = process.env.WEFT_TEST_REDIS
let proc: ChildProcess | undefined
let url = ''

beforeAll(async () => {
  if (!binary) return
  const port = await freePort()
  url = `redis://127.0.0.1:${port}`
  proc = spawn(binary, ['--port', String(port), '--save', '', '--appendonly', 'no'], {
    stdio: 'ignore',
  })
  await new Promise((ok) => {
    setTimeout(ok, 300)
  })
})
afterAll(() => proc?.kill('SIGKILL'))

// Needs a `redis-server` binary, named by `WEFT_TEST_REDIS`.
test.skipIf(!binary)('two instances share values and see each other’s tag bumps', async () => {
  const a = redisStore({ url, prefix: 'one:' })
  const b = redisStore({ url, prefix: 'one:' })
  const versions = await a.versions(['todos'])
  await a.set('k', { v: { n: 1 }, tags: ['todos'], versions, expires: Date.now() + 60_000 })
  const hit = await b.get('k')
  expect(hit?.v).toEqual({ n: 1 })
  expect(await b.versions(['todos'])).toEqual(versions)
  await b.bump(['todos'])
  expect(await a.versions(['todos'])).not.toEqual(versions)
  expect(await redisStore({ url, prefix: 'other:' }).get('k')).toBeUndefined()
})

// Needs a `redis-server` binary, named by `WEFT_TEST_REDIS`.
test.skipIf(!binary)('a value past its life is gone', async () => {
  const s = redisStore({ url, prefix: 'two:' })
  await s.set('k', { v: 1, tags: [], versions: [], expires: Date.now() + 50 })
  await new Promise((ok) => {
    setTimeout(ok, 120)
  })
  expect(await s.get('k')).toBeUndefined()
})

// Needs a `redis-server` binary, named by `WEFT_TEST_REDIS`.
test.skipIf(!binary)(
  'the rate limit counts across instances and says how long to wait',
  async () => {
    const a = redisRateLimit({ url, prefix: 'rl:' })
    const b = redisRateLimit({ url, prefix: 'rl:' })
    const rule = { window: 10, max: 2 }
    expect((await a.consume('ip', rule)).allowed).toBe(true)
    expect((await b.consume('ip', rule)).allowed).toBe(true)
    const third = await a.consume('ip', rule)
    expect(third.allowed).toBe(false)
    expect(third.retryAfter).toBeGreaterThan(0)
    expect((await a.consume('other', rule)).allowed).toBe(true)
  },
)

// Needs a `redis-server` binary, named by `WEFT_TEST_REDIS`.
test.skipIf(!binary)(
  "redisStore's consume is the server-function limit, shared by every instance",
  async () => {
    const a = redisStore({ url, prefix: 'three:' })
    const b = redisStore({ url, prefix: 'three:' })
    const rule = { window: 10, max: 1 }
    expect((await a.consume!('k', rule)).allowed).toBe(true)
    expect((await b.consume!('k', rule)).allowed).toBe(false)
  },
)

test('no URL is Q013, except in a build', () => {
  const was = process.env.REDIS_URL
  delete process.env.REDIS_URL
  try {
    expect(() => redisStore()).toThrow(/Q013/)
    vi.stubEnv('WEFT_BUILD', '1')
    expect(() => redisStore()).not.toThrow()
  } finally {
    vi.unstubAllEnvs()
    if (was !== undefined) process.env.REDIS_URL = was
  }
})
