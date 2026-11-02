// Better Auth as weft's default auth provider (research 28 §3, 34 §5). `src/auth.server.ts` default-exports `createAuth(…)`.
// No client code: sign-in is a mutation, so nothing of Better Auth ships to the browser.

import { betterAuth, type BetterAuthOptions } from 'better-auth'
import { CLIENT_IP, StartError } from '../data'
import type { DbHandle } from '../db/core'

const SESSION = /(?:^|;\s*)(?:__Secure-)?[\w.-]*session_token=/

/** `createAuth`: the database, the secret, and any Better Auth option on top. */
export interface AuthOptions<S extends Record<string, unknown>, O extends BetterAuthOptions> {
  db: { $weft: DbHandle }
  /** The tables, Better Auth's included, for a data layer that needs them. */
  schema?: S
  /** 32+ characters (A001 in production). */
  secret?: string
  /** The rest of Better Auth's options; they win over the defaults here. */
  options?: O
}

/** A Better Auth instance with Weft's defaults, on the store `options.database` names. */
export function createAuth<S extends Record<string, unknown>, const O extends BetterAuthOptions = {}>({ db, secret, options }: AuthOptions<S, O>) {
  const handle = db.$weft
  if (options?.database) for (const name of ['user', 'session', 'account', 'verification']) handle.exempt.add(name)
  else throw new StartError('A005', 'Better Auth has no store', 'pass `options.database`: `drizzleAuth(db, schema)` from @weft-js/start/auth/drizzle, or your data layer\'s adapter')
  const auth = betterAuth({
    secret,
    // A build's prerender holds no environment; a server takes `BETTER_AUTH_URL`, or the request's origin.
    ...(process.env.WEFT_BUILD && { baseURL: 'http://localhost' }),
    telemetry: { enabled: false },
    emailAndPassword: { enabled: true },
    ...options,
    // The server stamps this header from the socket (server.tsx), so rate limits aren't one bucket for everyone.
    // Its schema check runs when this module loads. On Kysely that connects, in a build, and before a fresh database has
    // had weft's migrations. Q014 covers a schema that doesn't match, so it's off unless you turn it on.
    advanced: { ...options?.advanced, database: { validateSchema: false, ...options?.advanced?.database }, ipAddress: { ipAddressHeaders: [CLIENT_IP], ...options?.advanced?.ipAddress } },
  })
  return Object.assign(auth, {
    basePath: options?.basePath,
    /** With no session cookie it's `null` without a query, so anonymous pages don't touch the database. */
    async session(request: Request) {
      if (!SESSION.test(request.headers.get('cookie') ?? '')) return { user: null, session: null }
      const s = await (auth as unknown as ReturnType<typeof betterAuth<BetterAuthOptions>>).api.getSession({ headers: request.headers })
      return { user: s?.user ?? null, session: s?.session ?? null }
    },
    $weft: {
      /** On the first request (never in a build, which holds no secrets). */
      check() {
        if (process.env.NODE_ENV === 'production' && (secret?.length ?? 0) < 32)
          throw new StartError('A001', 'the auth secret is missing or under 32 characters', 'set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) in the server\'s environment')
      },
    },
  })
}

