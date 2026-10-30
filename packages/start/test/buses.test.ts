// redis and nats against real servers, the bus contract and the gap signal. `WEFT_TEST_REDIS` and `WEFT_TEST_NATS` name
// a throwaway server, or a path to its binary (the test then runs its own, so it can restart it); they skip without.
// durable-object runs on workerd through Miniflare: no account, no deploy.
import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { Miniflare } from 'miniflare'
import { transformWithOxc } from 'vite'
import type { Bus } from '@weft/start'
import { redisBus } from '@weft/start/bus/redis'
import { natsBus } from '@weft/start/bus/nats'
import { durableObjectBus, WeftBusObject } from '@weft/start/bus/durable-object'

const freePort = () => new Promise<number>(ok => { const s = createServer().listen(0, () => { const { port } = s.address() as any; s.close(() => ok(port)) }) })
const until = async (f: () => boolean, ms = 5000) => { const end = Date.now() + ms; while (!f()) { if (Date.now() > end) throw new Error('timed out'); await new Promise(ok => setTimeout(ok, 10)) } }
const stop = (c: ChildProcess) => new Promise(ok => { c.once('close', ok); c.kill('SIGKILL') })

function contract(name: string, make: () => Bus, restart?: () => Promise<void>) {
  describe(name, () => {
    let a: Bus, b: Bus
    beforeEach(() => { a = make(); b = make() })
    afterEach(async () => { await a.close?.(); await b.close?.() })

    test('a message reaches a subscriber on another client, in order, and not after it stops', async () => {
      const got: string[] = []
      const off = await a.subscribe('weft:t:room 1:a*b>c', m => got.push(m))
      for (const m of ['one', 'two', 'three']) await b.publish('weft:t:room 1:a*b>c', m)
      await until(() => got.length === 3)
      expect(got).toEqual(['one', 'two', 'three'])
      off()
      await b.publish('weft:t:room 1:a*b>c', 'late')
      await new Promise(ok => setTimeout(ok, 100))
      expect(got).toHaveLength(3)
    })

    test('channels are separate, and a large message survives', async () => {
      const got: string[] = []
      const big = 'x'.repeat(200_000)
      await a.subscribe('one', m => got.push(m))
      await b.publish('two', 'nope')
      await b.publish('one', big)
      await until(() => got.length === 1)
      expect(got[0]).toBe(big)
    })

    if (restart) test('a dropped connection is a gap, and delivery resumes', async () => {
      const got: string[] = []
      let gaps = 0
      await a.subscribe('g', m => got.push(m), () => gaps++)
      await restart()
      await until(() => gaps > 0, 15_000)
      await until(() => { void b.publish('g', 'after').catch(() => {}); return got.length > 0 }, 15_000)
      expect(got[0]).toBe('after')
    }, 40_000)
  })
}

const redis = process.env.WEFT_TEST_REDIS
if (redis) {
  let port = 0, proc: ChildProcess
  const boot = async () => {
    proc = spawn(redis, ['--port', String(port), '--save', '', '--appendonly', 'no'], { stdio: 'ignore' })
    await new Promise(ok => setTimeout(ok, 300))
  }
  beforeAll(async () => { port = await freePort(); await boot() })
  afterAll(() => stop(proc))
  contract('redisBus', () => redisBus({ url: `redis://127.0.0.1:${port}` }), async () => { await stop(proc); await boot() })
}

const nats = process.env.WEFT_TEST_NATS
if (nats) {
  let port = 0, proc: ChildProcess
  const boot = async () => {
    proc = spawn(nats, ['-p', String(port), '-a', '127.0.0.1'], { stdio: 'ignore' })
    await new Promise(ok => setTimeout(ok, 300))
  }
  beforeAll(async () => { port = await freePort(); await boot() })
  afterAll(() => stop(proc))
  contract('natsBus', () => natsBus({ servers: `nats://127.0.0.1:${port}` }), async () => { await stop(proc); await boot() })
}

test('a bad URL names the code, and a build holds no connection', () => {
  expect(() => redisBus({ url: 'http://x' })).toThrow('Q013')
  expect(() => natsBus({ servers: '' })).toThrow('Q013')
})

describe('durableObjectBus on workerd', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/bus/durable-object.ts', import.meta.url)), 'utf8')
  // A hub lives in a Durable Object, so the socket a subscribe opens outlives a request.
  const hub = `
export class Hub {
  constructor(state, env) { this.env = env; this.got = []; this.gaps = 0 }
  async fetch(request) {
    const url = new URL(request.url)
    this.bus ??= durableObjectBus({ namespace: this.env.WEFT_BUS })
    if (url.pathname === '/sub') { await this.bus.subscribe(url.searchParams.get('c'), m => this.got.push(m), () => this.gaps++); return new Response('ok') }
    if (url.pathname === '/pub') { await this.bus.publish(url.searchParams.get('c'), url.searchParams.get('m')); return new Response('ok') }
    return Response.json({ got: this.got, gaps: this.gaps })
  }
}
export default { fetch: (request, env) => env.HUB.get(env.HUB.idFromName(new URL(request.url).searchParams.get('h') ?? 'a')).fetch(request) }
`
  let mf: Miniflare
  beforeAll(async () => {
    const script = (await transformWithOxc(source, 'durable-object.ts')).code + hub
    mf = new Miniflare({ modules: true, script, compatibilityDate: '2026-06-01', durableObjects: { WEFT_BUS: 'WeftBusObject', HUB: 'Hub' } })
    await mf.ready
  }, 60_000)
  afterAll(() => mf.dispose())
  const hit = (path: string) => mf.dispatchFetch(`http://x${path}`).then(r => r.text())

  test('a message crosses from one hub to another through the object', async () => {
    await hit('/sub?h=a&c=room')
    await hit('/sub?h=b&c=room')
    await hit('/pub?h=a&c=room&m=hello')
    await hit('/pub?h=b&c=other&m=not-here')
    let got: string[] = []
    for (let i = 0; i < 100 && got.length < 1; i++) {
      got = JSON.parse(await hit('/state?h=b')).got
      await new Promise(ok => setTimeout(ok, 20))
    }
    expect(got).toEqual(['hello'])
    expect(JSON.parse(await hit('/state?h=a')).got).toEqual(['hello'])
  })

  test('a lost socket is a gap, then a redial; messages flow again; `close` stops it', async () => {
    vi.useFakeTimers()
    const sockets: any[] = []
    const socket = () => {
      const on: Record<string, (e?: any) => void> = {}
      const ws = { accept() {}, send() {}, close: vi.fn(), addEventListener: (t: string, f: any) => { on[t] = f }, on }
      sockets.push(ws)
      return ws
    }
    let down = false
    const namespace = { idFromName: (n: string) => n, get: () => ({ fetch: async (_: string, init?: RequestInit) => {
      if (init?.method === 'POST') return new Response(null, { status: 204 })
      if (down) throw new Error('object restarting')
      return Object.assign(new Response(null), { webSocket: socket() })
    } }) }
    const bus = durableObjectBus({ namespace: namespace as any })
    const got: string[] = []
    let gaps = 0
    await bus.subscribe('c', m => got.push(m), () => gaps++)
    sockets[0].on.message({ data: 'one' })
    down = true
    sockets[0].on.close()
    expect(gaps).toBe(1)
    await vi.advanceTimersByTimeAsync(500)
    expect(gaps).toBe(2) // the redial failed, so that's another gap, and a longer wait
    down = false
    await vi.advanceTimersByTimeAsync(1000)
    expect(sockets).toHaveLength(2)
    sockets[1].on.message({ data: 'two' })
    expect(got).toEqual(['one', 'two'])
    await bus.close()
    expect(sockets[1].close).toHaveBeenCalledWith(1000)
    vi.useRealTimers()
  })

  test('a refused publish is an error the hub can see', async () => {
    const namespace = { idFromName: (n: string) => n, get: () => ({ fetch: async () => new Response(null, { status: 500 }) }) }
    await expect(durableObjectBus({ namespace: namespace as any }).publish('c', 'm')).rejects.toThrow('500')
  })
})
