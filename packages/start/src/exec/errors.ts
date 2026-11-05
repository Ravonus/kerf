import { FnError, StartError, type Context, type Fn } from '../data'
import { unavailable } from '../db/core'

/** `auth: 'user'`: A003 when `ctx` has no `user` at all, A002 when no one is signed in. */
export function guard(fn: Fn, ctx: Context) {
  if (fn.def.auth !== 'user') return
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
      'sign in first, or guard the route with `redirect()` in its `load`',
      { status: 401 },
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
