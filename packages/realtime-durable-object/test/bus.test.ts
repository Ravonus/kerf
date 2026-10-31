// durable-object runs on workerd through Miniflare: no account, no deploy. `busSuite` can't run against it from Node, since
// the hub has to live in a Durable Object, so these checks are the same requirements made from inside workerd.
import { fileURLToPath } from 'node:url'
import { readFileSync } from 'node:fs'
import { Miniflare } from 'miniflare'
import { transformWithOxc } from 'vite'
import { durableObjectBus } from '../src/index'

describe('durableObjectBus on workerd', () => {
  const source = readFileSync(fileURLToPath(new URL('../src/index.ts', import.meta.url)), 'utf8')
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
