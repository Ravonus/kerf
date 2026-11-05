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

import { StartError, type Context, type Fn } from './data'
import {
  DEFAULT_TIMEOUT,
  callContext,
  defaultClaims,
  encoder,
  env,
  settled,
  wire,
} from './rust/common'
import { createNative } from './rust/native'

/** Whoever `ctx.user` is in this app, once it declares `Context`. */
type User = Context extends { user: infer U } ? U | null : unknown

/** What a sidecar may know of the user. Sent signed; a sidecar never sees a cookie or a session token. */
export interface Claims {
  id: string
  roles?: string[]
  tenant?: string | null
  [key: string]: unknown
}

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
export interface RemoteCall {
  fn: Fn
  input: unknown
  ctx: Context
  request: Request
}
/** What a sidecar answered: the value, and the tags it says to refresh. */
export interface RemoteResult {
  value: unknown
  tags: string[]
  touched: string[]
}

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
/** `search-index` → `WEFT_RUST_SEARCH_INDEX_URL`. */
export const urlVariable = (service: string) =>
  `WEFT_RUST_${service.toUpperCase().replaceAll('-', '_')}_URL`

const hex = (b: ArrayBuffer) =>
  Array.from(new Uint8Array(b), (x) => x.toString(16).padStart(2, '0')).join('')
const base64url = (s: string) =>
  btoa(String.fromCharCode(...encoder.encode(s)))
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '')
const keys = new Map<string, Promise<CryptoKey>>()
const keyOf = (secret: string) => {
  let k = keys.get(secret)
  if (!k)
    keys.set(
      secret,
      (k = crypto.subtle.importKey(
        'raw',
        encoder.encode(secret),
        { name: 'HMAC', hash: 'SHA-256' },
        false,
        ['sign'],
      )),
    )
  return k
}

/** `weft-sig`: the crate's `verify` checks the same bytes. It covers the function and the body, not just the claims. */
export const sign = async (secret: string, id: string, ctx: string, body: string) =>
  hex(
    await crypto.subtle.sign(
      'HMAC',
      await keyOf(secret),
      encoder.encode(`weft1\n${id}\n${ctx}\n${body}`),
    ),
  )

/**
 * A Rust sidecar implementing the functions that point at it, as `impl: search`. `run` and `impl` are one or the other:
 * the declaration, the client and the caches are the same for both.
 */
export function remote(target: string, options: RemoteOptions = {}): Remote {
  const service = TARGET.exec(target)?.[1]
  if (!service)
    throw new StartError(
      'R106',
      `\`remote('${target}')\` isn't a sidecar target`,
      "`remote('rust://search')`, with the address in `WEFT_RUST_SEARCH_URL` or the `url` option",
    )
  const { timeout = DEFAULT_TIMEOUT, claims = defaultClaims, validate = true } = options
  return {
    kind: 'remote',
    target,
    service,
    async call({ fn, input, ctx, request }) {
      const url = options.url ?? env(urlVariable(service))
      if (!url)
        throw new StartError(
          'R106',
          `\`${fn.$id}\` is implemented by \`${target}\`, and this server has no address for it`,
          `set \`${urlVariable(service)}\` (\`weft dev\` and \`weft start\` do it for a sidecar they supervise), or pass \`url\` to \`remote()\``,
          { status: 503 },
        )
      const secret = env('WEFT_RUST_SECRET')
      if (!secret)
        throw new StartError(
          'R106',
          `\`${fn.$id}\` can't sign its call: \`WEFT_RUST_SECRET\` isn't set`,
          'set the same value on the server and the sidecar',
          { status: 503 },
        )

      const envelope = base64url(
        JSON.stringify({ ...callContext(fn, ctx, request, timeout, claims), iat: Date.now() }),
      )
      const body = JSON.stringify({ input: (await wire(fn, input)) ?? null })

      let res: Response
      try {
        res = await fetch(`${url.replace(/\/$/, '')}/_weft/fn/${encodeURIComponent(fn.$id)}`, {
          method: 'POST',
          headers: {
            'content-type': 'application/json',
            'weft-ctx': envelope,
            'weft-sig': await sign(secret, fn.$id, envelope, body),
          },
          body,
          signal: AbortSignal.any([AbortSignal.timeout(timeout), request.signal]),
        })
      } catch (e) {
        if ((e as Error | undefined)?.name === 'TimeoutError')
          throw new StartError(
            'R107',
            `\`${fn.$id}\` took longer than its ${timeout} ms`,
            'raise `timeout` on `remote()`, or make the sidecar answer sooner',
            { status: 504 },
          )
        throw new StartError(
          'R107',
          `\`${fn.$id}\`: \`${target}\` didn't answer`,
          'check that the sidecar is running. Nothing else on this server is affected',
          { status: 503 },
        )
      }
      return settled(fn, await res.json().catch(() => undefined), target, timeout, validate)
    },
  }
}

/** A Rust library implementing functions in this process. */
export function native(name: string, options: NativeOptions = {}): Native {
  return createNative(name, options, import.meta.url)
}
