// `remote()` and `native()` (PLAN §4.3, research 36 and 37): a server function whose body is Rust, in a sidecar over
// `fetch`, or in this process. One crossing per function. TS keeps the public edge: the input is validated before the
// call and the output after it, the user's claims go along (never cookies; signed for a sidecar), and the caches stay here.
//
//   // src/server/rust.ts: the only place Rust targets are named
//   export const search = remote('rust://search')
//   export const media = native('media')            // an addon, or its .wasm where an addon can't load
//
//   // src/server/docs.ts: swap `run` for `impl`, and nothing on the client changes
//   export const searchDocs = query({ input: Search, output: z.array(Hit), tags: ['docs'], impl: search })
//
// A sidecar's address and key are the environment's: `weft dev` and `weft start` set `WEFT_RUST_<NAME>_URL` and
// `WEFT_RUST_SECRET` for the sidecars they supervise, and a sidecar deployed on its own needs both set by hand.
// Nothing here imports a Node module, so none of it reaches a bundle that doesn't call it.

import type * as Fs from 'node:fs'
import type * as Path from 'node:path'
import type * as Url from 'node:url'
import { raise, StartError, type Context, type Fn } from './data'

/** Whoever `ctx.user` is in this app, once it declares `Context`. */
type User = Context extends { user: infer U } ? U | null : unknown

/** What a sidecar may know of the user. Sent signed; a sidecar never sees a cookie or a session token. */
export interface Claims { id: string; roles?: string[]; tenant?: string | null; [key: string]: unknown }

/** `remote()`: the address, the deadline, and how a user becomes claims. */
export interface RemoteOptions {
  /** The address, for a sidecar that isn't supervised here. Otherwise `WEFT_RUST_<NAME>_URL`. */
  url?: string
  /** Milliseconds a call may take, sent as its deadline. 10 s by default. */
  timeout?: number
  /** What a sidecar gets of `ctx.user`. By default `id`, `roles` (or `role`) and `tenant`. */
  claims?: (user: User) => Claims | null
  /** `false` trusts a sidecar's output. It's the only check that a sidecar still matches the contract: keep it on. */
  validate?: boolean
}

/** One function call on its way to a sidecar. */
export interface RemoteCall { fn: Fn; input: unknown; ctx: Context; request: Request }
/** What a sidecar answered: the value, and the tags it says to refresh. */
export interface RemoteResult { value: unknown; tags: string[]; touched: string[] }

/** What `remote()` returns: pass it as a function's `impl`. */
export interface Remote {
  readonly kind: 'remote'
  readonly target: string
  readonly service: string
  call(c: RemoteCall): Promise<RemoteResult>
}

/** `native()`: the deadline, and how a user becomes claims. */
export interface NativeOptions {
  /** Milliseconds TS waits. A call can't be stopped: `ctx.cancelled()` tells the Rust. 10 s by default. */
  timeout?: number
  /** What a function gets of `ctx.user`, as for `remote()`. */
  claims?: (user: User) => Claims | null
  /** `false` trusts the output. Keep it on: it's a check on every call, and small next to the work. */
  validate?: boolean
}

/** What `native()` returns: pass it as a function's `impl`. */
export interface Native {
  readonly kind: 'native'
  readonly target: string
  readonly service: string
  /** What's serving, once a call has loaded it: `addon` or `wasm`. For a log line or a test. */
  engine(): Promise<'addon' | 'wasm'>
  call(c: RemoteCall): Promise<RemoteResult>
}

const TARGET = /^rust:\/\/([a-z][a-z0-9_-]*)$/
const NAME = /^[a-z][a-z0-9_-]*$/
const DEFAULT_TIMEOUT = 10_000
const encoder = new TextEncoder()

// An app's tsc may have no Node types, so what's read of `process` is named here.
const nodeHost = globalThis as unknown as { process?: { env: Record<string, string | undefined>; platform: string; arch: string; getBuiltinModule?(name: string): unknown; dlopen(mod: object, file: string): void } }
const env = (name: string): string | undefined => nodeHost.process?.env?.[name] || undefined
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

const defaultClaims = (user: User): Claims | null => {
  const u = user as { id: unknown; roles?: string[]; role?: string; tenant?: string | null } | null
  return u && { id: String(u.id), roles: u.roles ?? (u.role ? [u.role] : []), ...(u.tenant != null && { tenant: u.tenant }) }
}

const TRACEPARENT = /^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/

/** The caller's trace with a new span, or a new trace. */
function traceparent(request: Request): string {
  const inbound = request.headers.get('traceparent')
  const trace = inbound && TRACEPARENT.test(inbound) ? inbound.split('-')[1] : randomHex(16)
  return `00-${trace}-${randomHex(8)}-01`
}

/** The value as a sidecar reads it: what the schema parsed, encoded back to the wire shape (codecs, defaults filled). */
function wire(fn: Fn, input: unknown): unknown {
  const schema = fn.def.input as { encodeAsync?: (value: unknown) => Promise<unknown> } | undefined
  if (typeof schema?.encodeAsync === 'function') return schema.encodeAsync(input)
  return input
}

async function checkedOutput(fn: Fn, value: unknown, validate: boolean): Promise<unknown> {
  const schema = fn.def.output
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

/** A shared value goes by no one's claims: the crate's `SharedCtx` has no user to read, and neither has the wire. */
function callContext(fn: Fn, ctx: Context, request: Request, timeout: number, claims: (user: User) => Claims | null) {
  const shared = fn.def.cache && fn.def.cache.scope !== 'user'
  return { user: shared ? null : claims((ctx as { user?: User }).user ?? null) ?? null, requestId: randomHex(8), deadlineMs: timeout, traceparent: traceparent(request) }
}

/** What a reply comes to: the same for a sidecar's body and an addon's string. */
async function settled(fn: Fn, reply: Reply | undefined, target: string, timeout: number, validate: boolean): Promise<RemoteResult> {
  if (reply?.ok === true) return { value: await checkedOutput(fn, reply.value, validate), tags: reply.tags ?? [], touched: reply.touched ?? [] }
  const error = reply?.error
  if (error?.code === 'Refused') throw new StartError('R106', `\`${target}\` refused \`${fn.$id}\`'s signature`, '`WEFT_RUST_SECRET` must be the same on both sides, and the clocks within a minute', { status: 503 })
  if (error?.code === 'Deadline') throw new StartError('R107', `\`${fn.$id}\` ran past its ${timeout} ms`, 'raise `timeout`, or make the Rust answer sooner', { status: 504 })
  if (error?.code === 'Drift') throw new StartError('R103', `\`${fn.$id}\` doesn't match \`${target}\`: ${error.message}`, 'rebuild it from the current contract', { status: 502 })
  if (error?.code && error.code !== 'Internal') await declared(fn, { code: error.code, data: error.data })
  // The detail stays in a log, under this id: a sidecar's own, or this server's for what ran in this process.
  if (error?.detail) console.error(`[weft] \`${fn.$id}\` failed (request ${error.requestId}): ${error.detail}`)
  throw new StartError('R108', `\`${fn.$id}\` failed in \`${target}\` (request ${error?.requestId ?? 'unknown'})`, 'find the request id in the server\'s or the sidecar\'s log', { status: 500 })
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

      const envelope = base64url(JSON.stringify({ ...callContext(fn, ctx, request, timeout, claims), iat: Date.now() }))
      const body = JSON.stringify({ input: (await wire(fn, input)) ?? null })

      let res: Response
      try {
        res = await fetch(`${url.replace(/\/$/, '')}/_weft/fn/${encodeURIComponent(fn.$id)}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json', 'weft-ctx': envelope, 'weft-sig': await sign(secret, fn.$id, envelope, body) },
          body,
          signal: AbortSignal.any([AbortSignal.timeout(timeout), request.signal]),
        })
      } catch (e) {
        if ((e as Error | undefined)?.name === 'TimeoutError') throw new StartError('R107', `\`${fn.$id}\` took longer than its ${timeout} ms`, 'raise `timeout` on `remote()`, or make the sidecar answer sooner', { status: 504 })
        throw new StartError('R107', `\`${fn.$id}\`: \`${target}\` didn't answer`, 'check that the sidecar is running. Nothing else on this server is affected', { status: 503 })
      }
      return settled(fn, await res.json().catch(() => undefined), target, timeout, validate)
    },
  }
}

// ---- native ---------------------------------------------------------------------------------------------------------

/** The exports a `.wasm` built by the crate has. */
interface Wasm { memory: WebAssembly.Memory; weft_init: () => void; weft_free: (ptr: number, len: number) => void; weft_alloc: (len: number) => number; weft_contract: () => bigint; weft_call: (i: number, il: number, c: number, cl: number, b: number, bl: number) => bigint }
interface Reply { ok?: boolean; value?: unknown; tags?: string[]; touched?: string[]; error?: { code?: string; message?: string; detail?: string; requestId?: string; data?: unknown } }
interface Engine { kind: 'addon' | 'wasm'; call(id: string, ctx: string, body: string): Promise<string> | string }
interface Entry { kind?: string; hash: string; addon?: string; wasm?: string; failure?: string }

interface Builtins { 'node:fs': typeof Fs; 'node:path': typeof Path; 'node:url': typeof Url }
const builtin = <K extends keyof Builtins>(name: K) => nodeHost.process?.getBuiltinModule?.(name) as Builtins[K] | undefined
const platform = () => { const p = nodeHost.process; return `${p?.platform}-${p?.arch}` }

/** `.output/server/rust/` from wherever the bundle put this code. `WEFT_NATIVE_DIR` is `weft dev`'s, and `weft build`'s. */
function nativeDir(): string | undefined {
  const fs = builtin('node:fs'), path = builtin('node:path')!, url = builtin('node:url')!
  if (!fs) return undefined
  const set = env('WEFT_NATIVE_DIR')
  if (set) return set
  let dir = path.dirname(url.fileURLToPath(import.meta.url))
  for (let i = 0; i < 6; i++, dir = path.dirname(dir)) if (fs.existsSync(path.join(dir, 'rust', 'manifest.json'))) return path.join(dir, 'rust')
  return undefined
}

function addonEngine(file: string, hash: string, target: string): Engine {
  const mod = { exports: {} as { contract: () => string; call: Engine['call'] } }
  nodeHost.process!.dlopen(mod, file)
  const built = JSON.parse(mod.exports.contract())
  if (built.hash !== hash) throw new StartError('R103', `\`${target}\`'s library was built from contract ${built.hash}, and this app's is ${hash}`, 'rebuild it: `weft build`', { status: 502 })
  return { kind: 'addon', call: mod.exports.call }
}

/**
 * The same functions as a `.wasm`, on this thread. A panic traps, which ends an instance: what it said arrives first,
 * and the next call gets a new one, as a sidecar's crash gets a restart.
 */
async function wasmEngine(file: string, hash: string, target: string): Promise<Engine> {
  const module = await WebAssembly.compile(builtin('node:fs')!.readFileSync(file))
  const decoder = new TextDecoder()
  let said = ''
  let x: Wasm | undefined
  const text = (ptr: number, len: number) => decoder.decode(new Uint8Array(x!.memory.buffer, ptr, len))
  const fresh = () => {
    x = new WebAssembly.Instance(module, { weft: { now: () => performance.now(), panicked: (ptr: number, len: number) => { said = text(ptr, len) } } }).exports as unknown as Wasm
    x.weft_init()
  }
  const taken = (packed: bigint) => {
    const ptr = Number(packed >> 32n), len = Number(packed & 0xffffffffn)
    const out = text(ptr, len)
    x!.weft_free(ptr, len)
    return out
  }
  const put = (s: string): [number, number] => {
    const bytes = encoder.encode(s)
    const ptr = x!.weft_alloc(bytes.length)
    new Uint8Array(x!.memory.buffer, ptr, bytes.length).set(bytes)
    return [ptr, bytes.length]
  }
  fresh()
  const built = JSON.parse(taken(x!.weft_contract()))
  if (built.hash !== hash) throw new StartError('R103', `\`${target}\`'s library was built from contract ${built.hash}, and this app's is ${hash}`, 'rebuild it: `weft build`', { status: 502 })
  return {
    kind: 'wasm',
    call(id, ctx, body) {
      if (!x) fresh()
      const [i, il] = put(id), [c, cl] = put(ctx), [b, bl] = put(body)
      try {
        const reply = taken(x!.weft_call(i, il, c, cl, b, bl))
        x!.weft_free(i, il)
        x!.weft_free(c, cl)
        return reply
      } catch (e) {
        if (!(e instanceof WebAssembly.RuntimeError)) throw e
        x = undefined
        return JSON.stringify({ ok: false, error: { code: 'Internal', requestId: JSON.parse(ctx).requestId, detail: said || e.message } })
      }
    },
  }
}

/**
 * A Rust library implementing the functions that point at it, in this process, as `impl: media`. An addon runs each call
 * on the worker pool, so the event loop stays free; where one can't load, its `.wasm` runs them on this thread. Either
 * way the declaration, the client and the caches are the same as for `run`.
 */
export function native(name: string, options: NativeOptions = {}): Native {
  if (!NAME.test(name)) throw new StartError('R104', `\`native('${name}')\` isn't a service name`, "`native('media')`, for the crate at `crates/media`")
  const { timeout = DEFAULT_TIMEOUT, claims = defaultClaims, validate = true } = options
  const target = `native('${name}')`
  // Before the pool's first use: its default of 4 is a ceiling on calls at once that an app would never think to raise.
  const proc = nodeHost.process
  if (proc?.env && !proc.env.UV_THREADPOOL_SIZE) proc.env.UV_THREADPOOL_SIZE = String(Math.max(4, globalThis.navigator?.hardwareConcurrency ?? 4))

  let loaded: Promise<Engine> | undefined, stamp: string | undefined

  async function load(dir: string, entry: Entry): Promise<Engine> {
    const fs = builtin('node:fs')!, path = builtin('node:path')!
    const addon = entry.addon && path.join(dir, entry.addon)
    if (addon && fs.existsSync(addon)) {
      try {
        return addonEngine(addon, entry.hash, target)
      } catch (e) {
        if (e instanceof StartError) throw e
        console.warn(`[weft] ${target}: the addon didn't load here (${String((e as { message?: unknown }).message).split('\n')[0]})${entry.wasm ? ': using its WASM' : ''}`)
      }
    }
    if (entry.wasm) return wasmEngine(path.join(dir, entry.wasm), entry.hash, target)
    throw new StartError('R104', `\`${target}\` has no addon for ${platform()} and no WASM`, 'build on this platform, drop `wasm: false` from `rust.services`, or use `remote()`', { status: 503 })
  }

  /** The engine for now. Under `weft dev` a rebuild is a new file: the next call loads it, and calls on the old one finish. */
  function engine(): Promise<Engine> {
    const fs = builtin('node:fs')!, path = builtin('node:path')!
    const dir = nativeDir()
    if (!dir) throw new StartError('R104', `\`${target}\` has nothing to load here`, 'this runtime has no file system, or the build has no `rust/` folder: use `remote()`, or run `weft build`', { status: 503 })
    const file = path.join(dir, 'manifest.json')
    const watching = !!env('WEFT_NATIVE_DIR')
    // Its text, not its mtime: two writes can land in one tick of a coarse clock.
    const text: string | undefined = watching && fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : undefined
    if (loaded && text === stamp) return loaded
    const entry: Entry | undefined = fs.existsSync(file) ? JSON.parse(text ?? fs.readFileSync(file, 'utf8'))[name] : undefined
    if (!entry) throw new StartError('R104', `\`${target}\` isn't in this build`, 'run `weft build`, or check `crates/' + name + '`', { status: 503 })
    if (entry.failure) throw new StartError('R103', `\`${target}\` didn't build: ${entry.failure}`, 'fix the crate: `weft dev` retries on every edit', { status: 503 })
    stamp = text
    const held = loaded
    const next = load(dir, entry)
    // A bad build keeps what was serving, as a sidecar's does.
    loaded = next.catch(e => { if (held) { loaded = held; return held } loaded = undefined; throw e })
    return loaded
  }

  return {
    kind: 'native', target: `native://${name}`, service: name,
    engine: async () => (await engine()).kind,
    async call({ fn, input, ctx, request }) {
      const context = JSON.stringify(callContext(fn, ctx, request, timeout, claims))
      const body = JSON.stringify({ input: (await wire(fn, input)) ?? null })
      const running = (await engine()).call(fn.$id, context, body)
      let timer: ReturnType<typeof setTimeout> | undefined
      const reply = typeof running === 'string' ? running : await Promise.race([running, new Promise<string>(ok => { timer = setTimeout(ok, timeout, '{"ok":false,"error":{"code":"Deadline"}}') })])
      clearTimeout(timer)
      return settled(fn, JSON.parse(reply), target, timeout, validate)
    },
  }
}
