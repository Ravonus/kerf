import { raise, StartError, type Context, type Fn } from '../data'
import type { Claims, RemoteResult } from '../rust'
type User = Context extends { user: infer U } ? U | null : unknown

export const DEFAULT_TIMEOUT = 10_000
export const encoder = new TextEncoder()

// An app's tsc may have no Node types, so what's read of `process` is named here.
export const nodeHost = globalThis as unknown as {
  process?: {
    env: Record<string, string | undefined>
    platform: string
    arch: string
    getBuiltinModule?(name: string): unknown
    dlopen(mod: object, file: string): void
  }
}
export const env = (name: string): string | undefined => nodeHost.process?.env?.[name] || undefined
export const randomHex = (bytes: number) =>
  Array.from(crypto.getRandomValues(new Uint8Array(bytes)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('')

export const defaultClaims = (user: User): Claims | null => {
  const u = user as { id: unknown; roles?: string[]; role?: string; tenant?: string | null } | null
  return (
    u && {
      id: String(u.id),
      roles: u.roles ?? (u.role ? [u.role] : []),
      ...(u.tenant != null && { tenant: u.tenant }),
    }
  )
}

const TRACEPARENT = /^00-(?!0{32})[0-9a-f]{32}-(?!0{16})[0-9a-f]{16}-[0-9a-f]{2}$/

/** The caller's trace with a new span, or a new trace. */
function traceparent(request: Request): string {
  const inbound = request.headers.get('traceparent')
  const trace = inbound && TRACEPARENT.test(inbound) ? inbound.split('-')[1] : randomHex(16)
  return `00-${trace}-${randomHex(8)}-01`
}

/** The value as a sidecar reads it: what the schema parsed, encoded back to the wire shape (codecs, defaults filled). */
export function wire(fn: Fn, input: unknown): unknown {
  const schema = fn.def.input as { encodeAsync?: (value: unknown) => Promise<unknown> } | undefined
  if (typeof schema?.encodeAsync === 'function') return schema.encodeAsync(input)
  return input
}

async function checkedOutput(fn: Fn, value: unknown, validate: boolean): Promise<unknown> {
  const schema = fn.def.output
  if (!schema || !validate) return value
  const r = await schema['~standard'].validate(value)
  if (!r.issues) return r.value
  const issues = r.issues
    .map(
      (i) =>
        `${i.path?.map((p) => (typeof p === 'object' ? p.key : p)).join('.') ?? ''}: ${i.message}`,
    )
    .join('; ')
  throw new StartError(
    'R103',
    `\`${fn.$id}\`'s sidecar returned a value its \`output\` schema rejects: ${issues}`,
    'the sidecar was built from another contract, or sets a field the schema refuses: rebuild it, or fix the schema',
    { status: 502 },
  )
}

/** A declared error: its data checked like any output, with the status a client can act on. */
async function declared(fn: Fn, error: { code: string; data?: unknown }): Promise<never> {
  const schema = fn.def.errors?.[error.code]
  if (!schema)
    throw new StartError(
      'R103',
      `\`${fn.$id}\`'s sidecar answered with the undeclared error \`${error.code}\``,
      'declare it in `errors`, or rebuild the sidecar from the current contract',
      { status: 502 },
    )
  const r = await schema['~standard'].validate(error.data ?? null)
  if (r.issues)
    throw new StartError(
      'R103',
      `\`${fn.$id}\`'s sidecar sent \`${error.code}\` with data its schema rejects`,
      'rebuild the sidecar from the current contract',
      { status: 502 },
    )
  raise(error.code, r.value)
}

/** A shared value goes by no one's claims: the crate's `SharedCtx` has no user to read, and neither has the wire. */
export function callContext(
  fn: Fn,
  ctx: Context,
  request: Request,
  timeout: number,
  claims: (user: User) => Claims | null,
) {
  const shared = fn.def.cache && fn.def.cache.scope !== 'user'
  return {
    user: shared ? null : (claims((ctx as { user?: User }).user ?? null) ?? null),
    requestId: randomHex(8),
    deadlineMs: timeout,
    traceparent: traceparent(request),
  }
}

/** What a reply comes to: the same for a sidecar's body and an addon's string. */
export async function settled(
  fn: Fn,
  reply: Reply | undefined,
  target: string,
  timeout: number,
  validate: boolean,
): Promise<RemoteResult> {
  if (reply?.ok === true)
    return {
      value: await checkedOutput(fn, reply.value, validate),
      tags: reply.tags ?? [],
      touched: reply.touched ?? [],
    }
  const error = reply?.error
  if (error?.code === 'Refused')
    throw new StartError(
      'R106',
      `\`${target}\` refused \`${fn.$id}\`'s signature`,
      '`KERF_RUST_SECRET` must be the same on both sides, and the clocks within a minute',
      { status: 503 },
    )
  if (error?.code === 'Deadline')
    throw new StartError(
      'R107',
      `\`${fn.$id}\` ran past its ${timeout} ms`,
      'raise `timeout`, or make the Rust answer sooner',
      { status: 504 },
    )
  if (error?.code === 'Drift')
    throw new StartError(
      'R103',
      `\`${fn.$id}\` doesn't match \`${target}\`: ${error.message}`,
      'rebuild it from the current contract',
      { status: 502 },
    )
  if (error?.code && error.code !== 'Internal')
    await declared(fn, { code: error.code, data: error.data })
  // The detail stays in a log, under this id: a sidecar's own, or this server's for what ran in this process.
  if (error?.detail)
    console.error(`[kerf] \`${fn.$id}\` failed (request ${error.requestId}): ${error.detail}`)
  throw new StartError(
    'R108',
    `\`${fn.$id}\` failed in \`${target}\` (request ${error?.requestId ?? 'unknown'})`,
    "find the request id in the server's or the sidecar's log",
    { status: 500 },
  )
}

export interface Reply {
  ok?: boolean
  value?: unknown
  tags?: string[]
  touched?: string[]
  error?: { code?: string; message?: string; detail?: string; requestId?: string; data?: unknown }
}
