// The adapters: the deterministic mock with the PNG decoder under it, and the bridge against a fake loopback
// service started here, including that no bearer token reaches a file or a log line.
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createServer, type IncomingHttpHeaders, type Server } from 'node:http'
import type { AddressInfo } from 'node:net'
import { join } from 'node:path'
import { crc32, deflateSync } from 'node:zlib'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createBridgeAdapter,
  createMockAdapter,
  decodePng,
  GenFailure,
  runGen,
  sha256,
  type GenRequest,
} from '../src/gen/index.mjs'
import { png } from '../src/paint.mjs'
import { cleanup, counted, distil, guidePng, project, scratch } from './gen.fixture.ts'

afterEach(cleanup)
afterEach(() => vi.unstubAllEnvs())

const request = (over: Partial<GenRequest> = {}): GenRequest => ({
  adapter: 'mock',
  model: 'mock@1',
  op: 'over',
  prompt: 'repaint',
  seed: 1,
  n: 2,
  inputs: [{ role: 'image', digest: 'g', bytes: guidePng(20, 10) }],
  ...over,
})

/** A PNG of `channels` per pixel (1 gray, 2 gray and alpha, 3 RGB, 4 RGBA), row `y` filtered with `y % 5`. */
function filtered(pixels: Uint8Array, width: number, height: number, channels: number) {
  const color = { 1: 0, 2: 4, 3: 2, 4: 6 }[channels]!
  const stride = width * channels
  const raw = Buffer.alloc((stride + 1) * height)
  const at = (y: number, x: number) => (y < 0 || x < 0 ? 0 : pixels[y * stride + x]!)
  for (let y = 0; y < height; y++) {
    const filter = y % 5
    raw[y * (stride + 1)] = filter
    for (let x = 0; x < stride; x++) {
      const a = at(y, x - channels)
      const b = at(y - 1, x)
      const c = at(y - 1, x - channels)
      const p = a + b - c
      const near =
        Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c)
          ? a
          : Math.abs(p - b) <= Math.abs(p - c)
            ? b
            : c
      const predict = [0, a, b, (a + b) >> 1, near][filter]!
      raw[y * (stride + 1) + 1 + x] = (at(y, x) - predict) & 255
    }
  }
  const chunk = (type: string, data: Buffer) => {
    const out = Buffer.alloc(12 + data.length)
    out.writeUInt32BE(data.length, 0)
    out.write(type, 4, 'latin1')
    data.copy(out, 8)
    out.writeUInt32BE(crc32(out.subarray(4, 8 + data.length)), 8 + data.length)
    return out
  }
  const head = Buffer.alloc(13)
  head.writeUInt32BE(width, 0)
  head.writeUInt32BE(height, 4)
  head.set([8, color, 0, 0, 0], 8)
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', head),
    chunk('IDAT', deflateSync(raw)),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

describe('decodePng', () => {
  it('reads back the encoder’s RGBA', () => {
    const rgba = new Uint8Array(7 * 5 * 4).map((_, i) => (i * 29 + (i >> 2)) & 255)
    expect(decodePng(png(rgba, 7, 5))).toEqual({ width: 7, height: 5, rgba })
  })

  it('reads RGBA, RGB, gray and gray with alpha through every row filter', () => {
    const width = 9
    const height = 10
    for (const channels of [1, 2, 3, 4]) {
      const pixels = new Uint8Array(width * height * channels).map(
        (_, i) => (i * 37 + (i >> 3) * 11) & 255,
      )
      const { rgba } = decodePng(filtered(pixels, width, height, channels))
      for (let i = 0; i < width * height; i++) {
        const p = pixels.subarray(i * channels, (i + 1) * channels)
        const want =
          channels >= 3
            ? [p[0], p[1], p[2], channels === 4 ? p[3] : 255]
            : [p[0], p[0], p[0], channels === 2 ? p[1] : 255]
        expect([...rgba.subarray(i * 4, i * 4 + 4)], `${channels} channels, pixel ${i}`).toEqual(
          want,
        )
      }
    }
  })
})

describe('the mock adapter', () => {
  it('gives the same bytes for the same request, and others for another seed', async () => {
    const mock = createMockAdapter()
    const one = await mock.run(request())
    const two = await mock.run(request())
    expect(one.outputs.map((b) => sha256(b))).toEqual(two.outputs.map((b) => sha256(b)))
    expect(sha256(one.outputs[0]!)).not.toBe(sha256(one.outputs[1]!))
    const other = await mock.run(request({ seed: 2 }))
    expect(sha256(other.outputs[0]!)).not.toBe(sha256(one.outputs[0]!))
    expect(decodePng(one.outputs[0]!)).toMatchObject({ width: 20, height: 10 })
    expect(one.tokens).toEqual({ input: 0, output: 0 })
  })

  it('paints a seeded pattern at the asked size for `make`', async () => {
    const out = await createMockAdapter().run(
      request({ op: 'make', inputs: [], size: '24x12', n: 1 }),
    )
    expect(decodePng(out.outputs[0]!)).toMatchObject({ width: 24, height: 12 })
  })

  it('stands in for a refusal, a timeout, a 429 and a wrong size', async () => {
    const mock = createMockAdapter()
    const outcome = (simulate: unknown) =>
      mock.run(request({ params: { simulate } })).then(
        () => 'ok',
        (error: GenFailure) => error.outcome,
      )
    expect(await outcome('refusal')).toBe('refused')
    expect(await outcome('timeout')).toBe('timeout')
    expect(await outcome('429')).toBe('rate-limited')
    const small = await mock.run(request({ size: '20x10', params: { simulate: 'wrong-size' } }))
    expect(decodePng(small.outputs[0]!)).toMatchObject({ width: 10, height: 5 })
  })
})

const SECRET = 'sentinel-7f3a-do-not-leak'
const seen: { url: string; headers: IncomingHttpHeaders; body: Record<string, unknown> }[] = []
let server: Server
let base = ''
let out = ''

/** The fake bridge's answer to the critic route and to prompts asking for a failure. */
function reply(url: string, prompt: string, authorization?: string) {
  if (url === '/chat')
    return { status: 200, json: { text: 'pick 1', tokens: { input: 40, output: 3 } } }
  if (prompt.includes('fail'))
    return { status: 200, json: { error: `backend said no to ${authorization}` } }
  if (prompt.includes('busy')) return { status: 429, json: { error: 'slow down' } }
  return undefined
}

/** A fake bridge: `/image` writes `n` PNGs and names them; a prompt with `fail` gets an error echoing the header. */
function startBridge() {
  out = scratch()
  server = createServer((req, res) => {
    let text = ''
    req.on('data', (chunk: Buffer) => (text += chunk.toString()))
    req.on('end', () => {
      const body = JSON.parse(text) as { prompt: string; n?: number; images: string[] }
      seen.push({ url: req.url!, headers: req.headers, body })
      res.setHeader('content-type', 'application/json')
      const answer = reply(req.url!, body.prompt, req.headers.authorization)
      if (answer) {
        res.statusCode = answer.status
        res.end(JSON.stringify(answer.json))
        return
      }
      const files = Array.from({ length: body.n ?? 1 }, (_, i) => {
        const file = join(out, `${seen.length}-${i}.png`)
        writeFileSync(file, guidePng(12, 8, i + seen.length))
        return file
      })
      res.end(
        JSON.stringify({
          files,
          tokens: { input: 120, output: 900 },
          durationMs: 42,
          jobId: `job-${seen.length}`,
          backend: 'seat-a',
        }),
      )
    })
  })
  return new Promise<void>((done) => {
    server.listen(0, '127.0.0.1', () => {
      base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
      done()
    })
  })
}

/** Each test gets a fresh fake bridge and the token set. */
function useBridge() {
  beforeEach(async () => {
    seen.length = 0
    process.env.WEFT_GEN_BRIDGE_TOKEN = SECRET
    await startBridge()
  })
  afterEach(async () => {
    delete process.env.WEFT_GEN_BRIDGE_TOKEN
    await new Promise((done) => {
      server.close(done)
    })
  })
}

describe('the bridge adapter', () => {
  useBridge()

  it('posts the prompt and input paths, reads the files it names and deletes them', async () => {
    const cacheDir = scratch()
    const bridge = createBridgeAdapter({ base, cacheDir })
    const guide = guidePng()
    const inputs = [{ role: 'image', digest: 'r', bytes: guide }]
    const result = await bridge.run(request({ size: '12x8', negative: 'text, logo', inputs }))
    const [call] = seen
    expect(call!.url).toBe('/image')
    expect(call!.headers.origin).toBe(base)
    expect(call!.headers['content-type']).toBe('application/json')
    expect(call!.headers.authorization).toBe(`Bearer ${SECRET}`)
    const written = join(cacheDir, 'inputs', `${sha256(guide)}.png`)
    expect(call!.body).toEqual({
      prompt: 'repaint\nAvoid: text, logo.',
      images: [written],
      size: '12x8',
      n: 2,
    })
    expect(readFileSync(written)).toEqual(Buffer.from(guide))
    expect(result.outputs.map((b) => sha256(b))).toEqual([
      sha256(guidePng(12, 8, 1)),
      sha256(guidePng(12, 8, 2)),
    ])
    expect(result).toMatchObject({
      mime: 'image/png',
      model: 'seat-a',
      tokens: { input: 120, output: 900 },
      durationMs: 42,
      requestId: 'job-1',
    })
    expect(readdirSync(out)).toEqual([])
  })

  it('turns an `error` into a failure carrying the message, and a 429 into rate-limited', async () => {
    const bridge = createBridgeAdapter({ base, cacheDir: scratch() })
    const failed = await bridge
      .run(request({ prompt: 'fail please' }))
      .catch((error: GenFailure) => error)
    expect(failed).toBeInstanceOf(GenFailure)
    expect(failed).toMatchObject({ outcome: 'failed' })
    expect((failed as Error).message).toBe(
      'bridge: /image 200: backend said no to Bearer [redacted]',
    )
    const busy = await bridge.run(request({ prompt: 'busy' })).catch((error: GenFailure) => error)
    expect(busy).toMatchObject({
      outcome: 'rate-limited',
      message: 'bridge: /image 429: slow down',
    })
  })

  it('asks the critic route about images', async () => {
    vi.stubEnv('WEFT_GEN_CRITIC_MODEL', 'critic-route')
    const bridge = createBridgeAdapter({ base, cacheDir: scratch() })
    const answer = await bridge.critique!({ prompt: 'which is better', images: ['/tmp/a.png'] })
    expect(answer).toEqual({ text: 'pick 1', tokens: { input: 40, output: 3 } })
    expect(seen[0]!.body).toEqual({
      prompt: 'which is better',
      modelId: 'critic-route',
      images: ['/tmp/a.png'],
    })
  })

  it('asks for a critic route before it calls one', async () => {
    vi.stubEnv('WEFT_GEN_CRITIC_MODEL', '')
    const bridge = createBridgeAdapter({ base, cacheDir: scratch() })
    await expect(bridge.critique!({ prompt: 'p', images: [] })).rejects.toThrow(
      /WEFT_GEN_CRITIC_MODEL/,
    )
  })

  it('takes a loopback bridge only', () => {
    expect(() =>
      createBridgeAdapter({ base: 'http://10.0.0.5:8795', cacheDir: scratch() }),
    ).toThrow(/loopback/)
  })
})

describe('a run through the bridge', () => {
  useBridge()

  it('writes the token to no file and no log line', async () => {
    vi.stubEnv('WEFT_GEN_CRITIC_MODEL', 'critic-route')
    const p = project({
      sky: { op: 'over', on: 'id:sky', says: 'soft cloud', out: 'palette:4', n: 2 },
      bad: { op: 'make', says: 'fail this one', out: 'params' },
      tile: { op: 'make', says: 'rib knit', out: 'tile:64' },
    })
    const lines: string[] = []
    const { adapter, calls } = counted(createBridgeAdapter({ base, cacheDir: p.cacheDir }))
    const result = await runGen({
      ...p,
      adapter,
      distil,
      maxCalls: 10,
      maxWallMs: 600_000,
      guides: () => [{ role: 'image', bytes: guidePng() }],
      critic: ({ candidates, critique }) =>
        critique!({ prompt: 'pick', images: candidates.map((c) => c.path) }).then((said) => ({
          pick: said.text.endsWith('1') ? 1 : 0,
        })),
      log: (line) => lines.push(line),
    })
    expect(calls).toHaveLength(3)
    expect(result.slots.map((s) => s.state)).toEqual(['made', 'failed', 'made'])
    expect(seen.filter((s) => s.url === '/chat')).toHaveLength(1)
    expect(seen.every((s) => s.headers.authorization === `Bearer ${SECRET}`)).toBe(true)
    expect(result.tokens).toEqual({ input: 280, output: 1803 })
    const files = (dir: string): string[] =>
      readdirSync(dir).flatMap((name) => {
        const path = join(dir, name)
        return statSync(path).isDirectory() ? files(path) : [path]
      })
    const written = files(p.dir)
    expect(written.length).toBeGreaterThan(8)
    expect(written.some((f) => f.endsWith('ledger.jsonl'))).toBe(true)
    expect(readFileSync(join(p.cacheDir, 'ledger.jsonl'), 'utf8')).toContain('[redacted]')
    for (const file of written) expect(readFileSync(file).includes(SECRET), file).toBe(false)
    expect(lines.length).toBeGreaterThan(2)
    for (const line of lines) expect(line).not.toContain(SECRET)
  })
})
