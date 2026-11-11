// The bridge adapter: model calls through a local loopback service that runs command-line tools on a seat, so the
// build holds no API key. It posts `{ prompt, images, size, n }` to `/image` and reads back the files it names, then
// deletes them. An optional bearer token comes from WEFT_GEN_BRIDGE_TOKEN; it goes in the header and nowhere else.
import { existsSync, readFileSync, rmSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { sha256 } from './digest.mjs'
import { GenFailure } from './guard.mjs'
import { writeAtomic } from './store.mjs'

export const BRIDGE = 'http://127.0.0.1:8795'
const criticModel = () => process.env.WEFT_GEN_CRITIC_MODEL
/** A call that takes longer than this has stalled. The run's wall cap can cut it shorter. */
const CALL_MS = 10 * 60_000
const WALL_ESTIMATE_MS = 90_000
const LOOPBACK = new Set(['127.0.0.1', 'localhost', '[::1]'])

const token = () => process.env.WEFT_GEN_BRIDGE_TOKEN

/** A bridge that echoes the request back in an error must not put the token in a log or the ledger. */
function redact(text) {
  const secret = token()
  return secret ? String(text).replaceAll(secret, '[redacted]') : String(text)
}

/** POSTs JSON to the bridge; a non-200 or an `error` field is a `GenFailure` with the bridge's message. */
async function post(origin, route, body, signal) {
  const headers = { 'content-type': 'application/json', origin }
  if (token()) headers.authorization = `Bearer ${token()}`
  const timeout = AbortSignal.timeout(CALL_MS)
  let res
  try {
    res = await fetch(`${origin}${route}`, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
  } catch (error) {
    if (error?.name === 'TimeoutError' || error?.name === 'AbortError')
      throw new GenFailure('timeout', `bridge: ${route} timed out`)
    throw new GenFailure('failed', `bridge: ${route}: ${redact(error?.message ?? error)}`)
  }
  const text = await res.text()
  let json
  try {
    json = JSON.parse(text)
  } catch {
    json = { error: text.slice(0, 200) }
  }
  if (!res.ok || json.error) {
    const outcome = res.status === 429 ? 'rate-limited' : 'failed'
    const message = `bridge: ${route} ${res.status}: ${redact(json.error ?? res.statusText)}`
    throw new GenFailure(outcome, message)
  }
  return json
}

/** An input's path for the bridge; bytes are written under `<cacheDir>/inputs/<digest>.png` first. */
function pathOf(cacheDir, input) {
  if (input.path !== undefined) return resolve(input.path)
  const file = join(cacheDir, 'inputs', `${sha256(input.bytes)}.png`)
  if (!existsSync(file)) writeAtomic(file, input.bytes)
  return file
}

const tokensOf = (json) => ({ input: json.tokens?.input ?? 0, output: json.tokens?.output ?? 0 })

/**
 * The bridge adapter. `base` is the bridge's origin (default `http://127.0.0.1:8795`); inputs given as bytes are
 * written under `<cacheDir>/inputs/`, since the bridge takes paths.
 */
export function createBridgeAdapter({ base = BRIDGE, cacheDir }) {
  const url = new URL(base)
  // The token and our guides go to this host: only a bridge on this machine.
  if (!LOOPBACK.has(url.hostname))
    throw new Error(`keel gen: the bridge must be on loopback, not ${url.host}`)
  const origin = url.origin
  return {
    id: 'bridge',
    model: 'bridge',
    capabilities: () => ({ ops: ['make', 'over'], maxInputs: 4, seed: false }),
    estimate: () => ({ calls: 1, wallMs: WALL_ESTIMATE_MS, seatTokens: 0 }),
    async run(request, { signal } = {}) {
      const images = request.inputs.map((input) => pathOf(cacheDir, input))
      const prompt = request.negative
        ? `${request.prompt}\nAvoid: ${request.negative}.`
        : request.prompt
      const body = { prompt, images, size: request.size, n: request.n }
      const json = await post(origin, '/image', body, signal)
      const files = Array.isArray(json.files) ? json.files : []
      // The caller owns the files: read each, then delete it, even when a read fails.
      const outputs = []
      try {
        for (const file of files) outputs.push(new Uint8Array(readFileSync(file)))
      } finally {
        for (const file of files) rmSync(file, { force: true })
      }
      if (!outputs.length) throw new GenFailure('failed', 'bridge: /image returned no files')
      return {
        outputs,
        mime: 'image/png',
        model: json.backend ?? 'bridge',
        tokens: tokensOf(json),
        durationMs: json.durationMs ?? 0,
        requestId: json.jobId,
      }
    },
    async critique({ prompt, images, modelId = criticModel() }, { signal } = {}) {
      if (!modelId)
        throw new Error('bridge: no critic route; set WEFT_GEN_CRITIC_MODEL or pass modelId')
      const body = { prompt, modelId, images: images.map((path) => resolve(path)) }
      const json = await post(origin, '/chat', body, signal)
      return { text: json.text ?? '', tokens: tokensOf(json) }
    },
  }
}
