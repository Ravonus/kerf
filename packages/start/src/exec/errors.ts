import { FnError, StartError, type Context, type Fn } from '../data'
import { unavailable } from '../db/core'

/** Whether a function names a rule that needs someone signed in (`'public'` and none don't). */
export const signedIn = (fn: Fn) => !!fn.def.auth && fn.def.auth !== 'public'

/** The roles a user has: Better Auth's `admin` plugin stores `'admin,user'`; an array works too. */
const rolesOf = (user: { role?: unknown }) =>
  Array.isArray(user.role)
    ? user.role.map(String)
    : typeof user.role === 'string'
      ? user.role.split(',').map((r) => r.trim())
      : []

/**
 * A function's `auth`: A003 when it needs a user and `ctx` has none at all, A002 when no one is signed in, A006 when
 * the user lacks the role or fails `can`. A mutation that says nothing, in an app with auth, needs a signed-in user.
 */
export async function guard(fn: Fn, ctx: Context) {
  const rule = fn.def.auth ?? (fn.kind === 'mutation' && 'user' in ctx ? 'user' : undefined)
  if (!rule || rule === 'public') return
  if (!('user' in ctx))
    throw new StartError(
      'A003',
      `\`${fn.$id}\` has \`auth: 'user'\`, but \`ctx\` has no \`user\``,
      'spread `session(auth, request)` into what `src/context.server.ts` returns',
      { status: 500 },
    )
  if (!(ctx as { user?: unknown }).user)
    throw new StartError(
      'A002',
      `\`${fn.$id}\` needs a signed-in user`,
      fn.def.auth
        ? 'sign in first, or guard the route with `redirect()` in its `load`'
        : "sign in first; a mutation anyone may call (sign-in, sign-up) says `auth: 'public'`",
      { status: 401 },
    )
  if (rule === 'user') return
  const user = (ctx as { user: { role?: unknown } }).user
  const allowed =
    'role' in rule
      ? [rule.role].flat().some((r) => rolesOf(user).includes(r))
      : await rule.can(ctx as never)
  if (!allowed)
    throw new StartError(
      'A006',
      `\`${fn.$id}\` refused this user (${'role' in rule ? `needs role ${[rule.role].flat().join(' or ')}` : '`can` said no'})`,
      'sign in as a user it allows',
      { status: 403 },
    )
}

const DOWN =
  /^(ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|CONNECT_TIMEOUT|CONNECTION_(CLOSED|ENDED|DESTROYED)|PROTOCOL_CONNECTION_LOST|P100[12])$/

interface Failure {
  cause?: Failure | null
  answer?: { message?: string; code?: string; status: number }
  code?: string | number
  message?: string
}

/** A dropped connection is Q016; a missing table is a migration that wasn't generated or applied (Q014): the driver's error, with the fix. */
export function dbError(e: unknown): unknown {
  const failure = e as Failure | null | undefined
  const cause = failure?.cause ?? failure
  if (failure?.answer) return new FnError(failure.answer, failure.answer.status)
  if (cause instanceof StartError) return cause // Drizzle wraps what a driver throws, the gate's Q016 included
  if (!(e instanceof StartError) && DOWN.test(String(cause?.code ?? failure?.code ?? '')))
    return unavailable(e)
  const m = cause?.message ?? ''
  if (
    e instanceof StartError ||
    !(
      /no such (table|column)|has no column named/.test(m) ||
      cause?.code === '42P01' ||
      cause?.code === '42703'
    )
  )
    return e
  return new StartError(
    'Q014',
    `the database doesn't match the schema: ${m}`,
    'run `weft db generate`, then reload (new migrations apply on the next request)',
    { status: 500 },
  )
}
