// The mock adapter, for tests and CI: deterministic, no network and no seat. It paints over a guide with seeded
// per-block colour jitter and a light blur, or paints a seeded pattern for `make`, so the distillers downstream get
// pictures with structure. `params.simulate` stands in for a model's failures.
import { readFileSync } from 'node:fs'
import { png } from '../paint.mjs'
import { requestDigest } from './digest.mjs'
import { GenFailure } from './guard.mjs'
import { decodePng } from './png.mjs'

const BLOCK = 8
const MAKE_SIZE = 256
const FAILURES = {
  refusal: ['refused', 'mock: the model declined the request'],
  timeout: ['timeout', 'mock: the call timed out'],
  429: ['rate-limited', 'mock: 429 too many requests'],
}

/** mulberry32 over a 32-bit seed: the same numbers on every engine. */
function random(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

const sizeOf = (size) => size?.split('x').map(Number)

/** The guide resampled to `width` × `height`, nearest pixel. */
function resample(image, width, height) {
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const sx = Math.floor((x * image.width) / width)
      const sy = Math.floor((y * image.height) / height)
      out.set(
        image.rgba.subarray((sy * image.width + sx) * 4, (sy * image.width + sx) * 4 + 4),
        (y * width + x) * 4,
      )
    }
  return out
}

/** A seeded pattern: soft bands of two seeded colours, with block jitter added after. */
function pattern(width, height, next) {
  const [a, b] = [0, 1].map(() => [next() * 255, next() * 255, next() * 255])
  const turns = 1 + next() * 4
  const out = new Uint8Array(width * height * 4)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const t = 0.5 + 0.5 * Math.sin(((x + y * 0.6) / width) * Math.PI * 2 * turns)
      for (let c = 0; c < 3; c++) out[(y * width + x) * 4 + c] = a[c] * t + b[c] * (1 - t)
      out[(y * width + x) * 4 + 3] = 255
    }
  return out
}

/** Seeded colour jitter per block, then a 3×3 box blur. */
function paintOver(rgba, width, height, next) {
  const shift = []
  for (let i = 0; i < Math.ceil(width / BLOCK) * Math.ceil(height / BLOCK) * 3; i++)
    shift.push(Math.round((next() - 0.5) * 48))
  const blocks = Math.ceil(width / BLOCK)
  const jittered = new Uint8Array(rgba)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const block = (Math.floor(y / BLOCK) * blocks + Math.floor(x / BLOCK)) * 3
      for (let c = 0; c < 3; c++) {
        const i = (y * width + x) * 4 + c
        jittered[i] = Math.min(255, Math.max(0, rgba[i] + shift[block + c]))
      }
    }
  const out = new Uint8Array(jittered)
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      for (let c = 0; c < 3; c++) {
        let sum = 0
        let count = 0
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) {
            const sx = x + dx
            const sy = y + dy
            if (sx < 0 || sy < 0 || sx >= width || sy >= height) continue
            sum += jittered[(sy * width + sx) * 4 + c]
            count++
          }
        out[(y * width + x) * 4 + c] = Math.round(sum / count)
      }
  return out
}

/** The outputs for a request: the guide painted over, or a pattern, `n` times. */
function paint(request) {
  const started = performance.now()
  const simulate = request.params?.simulate
  if (Object.hasOwn(FAILURES, simulate)) throw new GenFailure(...FAILURES[simulate])
  const guide = request.inputs.find((input) => input.role !== 'mask')
  const image = guide && decodePng(guide.bytes ?? readFileSync(guide.path))
  const [asked, height] =
    sizeOf(request.size) ?? (image ? [image.width, image.height] : [MAKE_SIZE, MAKE_SIZE])
  // Another shape, not only another size: a size that keeps the shape is a model's nearest supported size.
  const width = simulate === 'wrong-size' ? Math.max(1, asked >> 1) : asked
  const digest = requestDigest(request)
  const outputs = []
  for (let i = 0; i < request.n; i++) {
    const next = random(Number.parseInt(digest.slice(0, 8), 16) ^ (i * 0x9e3779b9))
    const base = image ? resample(image, width, height) : pattern(width, height, next)
    outputs.push(new Uint8Array(png(paintOver(base, width, height, next), width, height)))
  }
  const durationMs = Math.round(performance.now() - started)
  return {
    outputs,
    mime: 'image/png',
    model: 'mock@1',
    tokens: { input: 0, output: 0 },
    durationMs,
  }
}

/** The mock adapter. The same request gives the same bytes. */
export function createMockAdapter() {
  return {
    id: 'mock',
    model: 'mock@1',
    capabilities: () => ({ ops: ['make', 'over', 'control'], maxInputs: 4, seed: true }),
    estimate: () => ({ calls: 1, wallMs: 10, seatTokens: 0 }),
    run: (request) =>
      new Promise((done) => {
        done(paint(request))
      }),
  }
}
