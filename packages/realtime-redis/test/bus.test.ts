// redis against a real server, through the `realtime.bus` suite. `WEFT_TEST_REDIS` is the path to a binary (the test
// runs its own, so it can restart it); without it the server half skips, which is reported, not hidden.
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { busSuite } from 'weft/test/plugins'
import { bus, redisBus } from '../src/index'

const freePort = () => new Promise<number>(ok => { const s = createServer().listen(0, () => { const { port } = s.address() as any; s.close(() => ok(port)) }) })
const stop = (c: ChildProcess) => new Promise(ok => { c.once('close', ok); c.kill('SIGKILL') })

const binary = process.env.WEFT_TEST_REDIS

test.skipIf(!binary)('redisBus passes realtime.bus@1 on a real server, a restart included', async () => {
  const port = await freePort()
  let proc: ChildProcess
  const boot = async () => {
    proc = spawn(binary!, ['--port', String(port), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' })
    await new Promise(ok => setTimeout(ok, 300))
  }
  await boot()
  try {
    const checks = await busSuite({ make: () => redisBus({ url: `redis://127.0.0.1:${port}` }), restart: async () => { await stop(proc); await boot() } })
    expect(checks.filter(c => !c.ok)).toEqual([])
    expect(checks.length).toBeGreaterThanOrEqual(9)
  } finally {
    await stop(proc!)
  }
}, 90_000)

test('a bad URL names the code', () => {
  expect(() => redisBus({ url: 'http://x' })).toThrow('Q013')
})

test('the provider reads `REDIS_URL`, and an option beats it', () => {
  delete process.env.REDIS_URL
  expect(() => bus()).toThrow('Q013')
  expect(bus({ url: 'redis://localhost' }).name).toBe('redis')
})
