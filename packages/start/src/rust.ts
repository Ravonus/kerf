// `remote()` (PLAN §4.3, research 36): a server function whose body is a Rust sidecar. One crossing per function, over
// `fetch` so it's the same on Node, Bun, Deno and the edge. TS keeps the public edge: the input is validated before the
// call and the output after it, the user's claims go signed (never cookies), and the caches stay here.
//
//   // src/server/rust.ts: the only place Rust targets are named
//   export const search = remote('rust://search')
//
//   // src/server/docs.ts: swap `run` for `impl`, and nothing on the client changes
//   export const searchDocs = query({ input: Search, output: z.array(Hit), tags: ['docs'], impl: search })
//
// The address and the key are the environment's: `weft dev` and `weft start` set `WEFT_RUST_<NAME>_URL` and
// `WEFT_RUST_SECRET` for the sidecars they supervise, and a sidecar deployed on its own needs both set by hand.

import { raise, StartError, type Fn, type StandardSchemaV1 } from './data'

/** What a sidecar may know of the user. Sent signed; a sidecar never sees a cookie or a session token. */
export interface Claims { id: string; roles?: string[]; tenant?: string | null; [key: string]: unknown }

export interface RemoteOptions {
  /** The address, for a sidecar that isn't supervised here. Otherwise `WEFT_RUST_<NAME>_URL`. */
  url?: string
  /** Milliseconds a call may take, sent as its deadline. 10 s by default. */
  timeout?: number
  /** What a sidecar gets of `ctx.user`. By default `id`, `roles` (or `role`) and `tenant`. */
  claims?: (user: any) => Claims | null
  /** `false` trusts a sidecar's output. It's the only check that a sidecar still matches the contract: keep it on. */
  validate?: boolean
}

export interface RemoteCall { fn: Fn; input: unknown; ctx: any; request: Request }
export interface RemoteResult { value: unknown; tags: string[]; touched: string[] }

export interface Remote {
  readonly kind: 'remote'
  readonly target: string
  readonly service: string
  call(c: RemoteCall): Promise<RemoteResult>
}

const TARGET = /^rust:\/\/([a-z][a-z0-9_-]*)$/
const DEFAULT_TIMEOUT = 10_000
const encoder = new TextEncoder()

const env = (name: string): string | undefined => (globalThis as any).process?.env?.[name] || undefined
/** `search-index` → `WEFT_RUST_SEARCH_INDEX_URL`. */
export const urlVariable = (service: string) => `WEFT_RUST_${service.toUpperCase().replaceAll('-', '_')}_URL`

const hex = (b: ArrayBuffer) => Array.from(new Uint8Array(b), x => x.toString(16).padStart(2, '0')).join('')
const base64url = (s: string) => btoa(String.fromCharCode(...encoder.encode(s))).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '')
const randomHex = (bytes: number) => Array.from(crypto.getRandomValues(new Uint8Array(bytes)), x => x.toString(16).padStart(2, '0')).join('')

const keys = new Map<string, Promise<CryptoKey>>()
const keyOf = (secret: string) => {
  let k = keys.get(secret)
  if (!k) keys.set(secret, (k = crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])))
  return k
}

/** `weft-sig`: the crate's `verify` checks the same bytes. It covers the function and the body, not just the claims. */
export const sign = async (secret: string, id: string, ctx: string, body: string) =>
  hex(await crypto.subtle.sign('HMAC', await keyOf(secret), encoder.encode(`weft1\n${id}\n${ctx}\n${body}`)))

const defaultClaims = (u: any): Claims | null => u && { id: String(u.id), roles: u.roles ?? (u.role ? [u.role] : []), ...(u.tenant != null && { tenant: u.tenant }) }

const TRACEPARENT = /^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/

/** The caller's trace with a new span, or a new trace. */
function traceparent(request: Request): string {
  const inbound = request.headers.get('traceparent')
  const trace = inbound && TRACEPARENT.test(inbound) ? inbound.split('-')[1] : randomHex(16)
  return `00-${trace}-${randomHex(8)}-01`
}

/** The value as a sidecar reads it: what the schema parsed, encoded back to the wire shape (codecs, defaults filled). */
async function wire(fn: Fn, input: unknown): Promise<unknown> {
  const schema = fn.def.input as any
  if (typeof schema?.encodeAsync === 'function') return schema.encodeAsync(input)
  return input
}

async function checkedOutput(fn: Fn, value: unknown, validate: boolean): Promise<unknown> {
  const schema = fn.def.output as StandardSchemaV1 | undefined
  if (!schema || !validate) return value
  const r = await schema['~standard'].validate(value)
  if (!r.issues) return r.value
  const issues = r.issues.map(i => `${i.path?.map(p => (typeof p === 'object' ? p.key : p)).join('.') ?? ''}: ${i.message}`).join('; ')
  throw new StartError('R103', `\`${fn.$id}\`'s sidecar returned a value its \`output\` schema rejects: ${issues}`, 'the sidecar was built from another contract, or sets a field the schema refuses: rebuild it, or fix the schema', { status: 502 })
}

/** A declared error: its data checked like any output, with the status a client can act on. */
async function declared(fn: Fn, error: { code: string; data?: unknown }): Promise<never> {
  const schema = fn.def.errors?.[error.code]
  if (!schema) throw new StartError('R103', `\`${fn.$id}\`'s sidecar answered with the undeclared error \`${error.code}\``, 'declare it in `errors`, or rebuild the sidecar from the current contract', { status: 502 })
  const r = await schema['~standard'].validate(error.data ?? null)
  if (r.issues) throw new StartError('R103', `\`${fn.$id}\`'s sidecar sent \`${error.code}\` with data its schema rejects`, 'rebuild the sidecar from the current contract', { status: 502 })
  raise(error.code, r.value)
}

/**
 * A Rust sidecar implementing the functions that point at it, as `impl: search`. `run` and `impl` are one or the other:
 * the declaration, the client and the caches are the same for both.
 */
export function remote(target: string, options: RemoteOptions = {}): Remote {
  const service = TARGET.exec(target)?.[1]
  if (!service) throw new StartError('R106', `\`remote('${target}')\` isn't a sidecar target`, "`remote('rust://search')`, with the address in `WEFT_RUST_SEARCH_URL` or the `url` option")
  const { timeout = DEFAULT_TIMEOUT, claims = defaultClaims, validate = true } = options
  return {
    kind: 'remote', target, service,
    async call({ fn, input, ctx, request }) {
      const url = options.url ?? env(urlVariable(service))
      if (!url) throw new StartError('R106', `\`${fn.$id}\` is implemented by \`${target}\`, and this server has no address for it`, `set \`${urlVariable(service)}\` (\`weft dev\` and \`weft start\` do it for a sidecar they supervise), or pass \`url\` to \`remote()\``, { status: 503 })
      const secret = env('WEFT_RUST_SECRET')
      if (!secret) throw new StartError('R106', `\`${fn.$id}\` can't sign its call: \`WEFT_RUST_SECRET\` isn't set`, 'set the same value on the server and the sidecar', { status: 503 })

      // A shared value goes by no one's claims: the crate's `SharedCtx` has no user to read, and neither has the wire.
      const shared = fn.def.cache && fn.def.cache.scope !== 'user'
      const user = shared ? null : claims((ctx as any).user ?? null) ?? null
      const envelope = base64url(JSON.stringify({ user, requestId: randomHex(8), deadlineMs: timeout, traceparent: traceparent(request), iat: Date.now() }))
      const body = JSON.stringify({ input: (await wire(fn, input)) ?? null })

      let res: Response
      try {
        res = await fetch(`${url.replace(/\/$/, '')}/_weft/fn/${encodeURIComponent(fn.$id)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'weft-ctx': envelope, 'weft-sig': await sign(secret, fn.$id, envelope, body) },
          body,
          signal: AbortSignal.any([AbortSignal.timeout(timeout), request.signal]),
        })
      } catch (e: any) {
        if (e?.name === 'TimeoutError') throw new StartError('R107', `\`${fn.$id}\` took longer than its ${timeout} ms`, 'raise `timeout` on `remote()`, or make the sidecar answer sooner', { status: 504 })
        throw new StartError('R107', `\`${fn.$id}\`: \`${target}\` didn't answer`, 'check that the sidecar is running. Nothing else on this server is affected', { status: 503 })
      }
      const reply = await res.json().catch(() => undefined)
      if (reply?.ok === true) return { value: await checkedOutput(fn, reply.value, validate), tags: reply.tags ?? [], touched: reply.touched ?? [] }
      const error = reply?.error
      if (error?.code === 'Refused') throw new StartError('R106', `\`${target}\` refused \`${fn.$id}\`'s signature`, '`WEFT_RUST_SECRET` must be the same on both sides, and the clocks within a minute', { status: 503 })
      if (error?.code === 'Deadline') throw new StartError('R107', `\`${fn.$id}\` ran past its ${timeout} ms`, 'raise `timeout` on `remote()`, or make the sidecar answer sooner', { status: 504 })
      if (error?.code === 'Drift') throw new StartError('R103', `\`${fn.$id}\` doesn't match its sidecar: ${error.message}`, 'rebuild the sidecar from the current contract', { status: 502 })
      if (error?.code && error.code !== 'Internal') await declared(fn, error)
      // The detail stays in the sidecar's log, under this id.
      throw new StartError('R108', `\`${fn.$id}\` failed in \`${target}\` (request ${error?.requestId ?? 'unknown'})`, 'find the request id in the sidecar\'s log', { status: 500 })
    },
  }
}
