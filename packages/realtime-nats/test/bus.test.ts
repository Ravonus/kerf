// nats against a real server, through the `realtime.bus` suite. `WEFT_TEST_NATS` is the path to a binary.
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { busSuite } from '@weft-js/core/test/plugins'
import { bus, natsBus } from '../src/index'

const freePort = () => new Promise<number>(ok => { const s = createServer().listen(0, () => { const { port } = s.address() as any; s.close(() => ok(port)) }) })
const stop = (c: ChildProcess) => new Promise(ok => { c.once('close', ok); c.kill('SIGKILL') })

const binary = process.env.WEFT_TEST_NATS

test.skipIf(!binary)('natsBus passes realtime.bus@1 on a real server, a restart included', async () => {
  const port = await freePort()
  let proc: ChildProcess
  const boot = async () => {
    proc = spawn(binary!, ['-p', String(port), '-a', '127.0.0.1'], { stdio: 'ignore' })
    await new Promise(ok => setTimeout(ok, 300))
  }
  await boot()
  try {
    const checks = await busSuite({ make: () => natsBus({ servers: `nats://127.0.0.1:${port}` }), restart: async () => { await stop(proc); await boot() } })
    expect(checks.filter(c => !c.ok)).toEqual([])
    expect(checks.length).toBeGreaterThanOrEqual(9)
  } finally {
    await stop(proc!)
  }
}, 90_000)

test('no servers names the code', () => {
  expect(() => natsBus({ servers: '' })).toThrow('Q013')
})

test('the provider reads `NATS_URL`', () => {
  delete process.env.NATS_URL
  expect(() => bus()).toThrow('Q013')
})
