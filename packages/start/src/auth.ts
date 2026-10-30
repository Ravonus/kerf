// `@weft/start/auth` (research 28 §3): Better Auth on the app's Drizzle client. `src/auth.server.ts` default-exports
// `createAuth(…)`, and the plugin mounts its handler; `session()` is the context's `ctx.user`; `forward()` is how a
// mutation signs someone in. No client code: sign-in is a mutation, so nothing of Better Auth ships to the browser.

import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { drizzleAdapter } from 'better-auth/adapters/drizzle'
import { CLIENT_IP, FnError, StartError, type Context } from './data'
import { getTableName, isTable } from 'drizzle-orm'
import type { DbHandle } from './db/core'

const SESSION = /(?:^|;\s*)(?:__Secure-)?[\w.-]*session_token=/

export interface AuthOptions<S extends Record<string, unknown>, O extends BetterAuthOptions> {
  db: { $weft: DbHandle }
  /** The tables, Better Auth's included. */
  schema: S
  /** 32+ characters (A001 in production). */
  secret?: string
  /** The rest of Better Auth's options; they win over the defaults here. */
  options?: O
}

export function createAuth<S extends Record<string, unknown>, const O extends BetterAuthOptions = {}>({ db, schema, secret, options }: AuthOptions<S, O>) {
  const handle = db.$weft
  for (const name of ['user', 'session', 'account', 'verification']) {
    const t = schema[name]
    if (isTable(t)) handle.exempt.add(getTableName(t))
  }
  const auth = betterAuth({
    secret,
    // A build's prerender holds no environment; a server takes `BETTER_AUTH_URL`, or the request's origin.
    ...(process.env.WEFT_BUILD && { baseURL: 'http://localhost' }),
    telemetry: { enabled: false },
    emailAndPassword: { enabled: true },
    database: drizzleAdapter(db as any, { provider: handle.dialect === 'postgresql' ? 'pg' : 'sqlite', schema }),
    ...options,
    // The server stamps this header from the socket (server.tsx), so rate limits aren't one bucket for everyone.
    advanced: { ...options?.advanced, ipAddress: { ipAddressHeaders: [CLIENT_IP], ...options?.advanced?.ipAddress } },
  } as O & BetterAuthOptions)
  return Object.assign(auth, {
    $weft: {
      /** On the first request (never in a build, which holds no secrets). */
      check() {
        if (process.env.NODE_ENV === 'production' && (secret?.length ?? 0) < 32)
          throw new StartError('A001', 'the auth secret is missing or under 32 characters', 'set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) in the server\'s environment')
      },
    },
  })
}

/**
 * `{ user, session }` for `ctx` (`src/context.server.ts`). With no session cookie it's `null` without a query, so
 * anonymous pages don't touch the database.
 */
export async function session<A extends { api: { getSession(args: { headers: Headers }): Promise<any> } }>(auth: A, request: Request): Promise<{
  user: NonNullable<Awaited<ReturnType<A['api']['getSession']>>>['user'] | null
  session: NonNullable<Awaited<ReturnType<A['api']['getSession']>>>['session'] | null
}> {
  if (!SESSION.test(request.headers.get('cookie') ?? '')) return { user: null, session: null }
  const s = await auth.api.getSession({ headers: request.headers })
  return { user: s?.user ?? null, session: s?.session ?? null }
}

/**
 * Finish a Better Auth call made with `asResponse: true`: its cookies go on this response, and a failure rejects with
 * Better Auth's message (`e.message` on the client).
 */
export async function forward(ctx: Context, call: Response | Promise<Response>): Promise<any> {
  const res = await call
  for (const c of res.headers.getSetCookie()) ctx.response.headers.append('set-cookie', c)
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new FnError({ code: body?.code, message: body?.message ?? 'Authentication failed' }, res.status)
  return body
}
