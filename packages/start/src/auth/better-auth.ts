// Better Auth as kerf's default auth provider (research 28 §3, 34 §5). `src/auth.server.ts` default-exports `createAuth(…)`.
// No client code: sign-in is a mutation, so nothing of Better Auth ships to the browser.

import { betterAuth, type BetterAuthOptions, type BetterAuthPlugin } from 'better-auth'
import { mailed } from './emails'
import { createAuthMiddleware } from 'better-auth/api'
import { expireCookie } from 'better-auth/cookies'
import { jwt, type JwtOptions } from 'better-auth/plugins/jwt'
import { CLIENT_IP, currentScope, fnOf, StartError } from '../data'
import type { DbHandle } from '../db/core'

const SESSION = /(?:^|;\s*)(?:__Secure-)?[\w.-]*session_token=/
const BEARER = /^Bearer\s+(\S+)$/i
const CHUNK = /^(?:__Secure-)?[\w.-]*session_data\.\d+=/
/** A socket or stream keeps its `ctx` past this request, and an extension's route is its own, so they never read the cache. */
const HELD = /^\/_kerf\/(rt|ws|x\/)/
const FN = '/_kerf/fn/'
const ANONYMOUS = { user: null, session: null }
const TABLES = ['user', 'session', 'account', 'verification', 'jwks']
const ROTATE = 60 * 60 * 24 * 30

/** A cache too big for one cookie is no cache: that session just reads the database. An expired chunk still goes out. */
const oversized = (line: string) =>
  CHUNK.test(line) && !/max-age=0/i.test(line) && !/^[^=]+=;/.test(line)

/** Better Auth's own routes follow the rule `session()` does: only reading who you are can answer from the cache. */
const cacheRules: BetterAuthPlugin = {
  id: 'kerf-session-cache',
  hooks: {
    // `/token` above all: a revoked session mustn't mint a 15-minute token from a cookie it still holds.
    before: [
      {
        matcher: (c) => c.path !== '/get-session',
        handler: createAuthMiddleware((c) =>
          Promise.resolve({ context: { query: { ...c.query, disableCookieCache: true } } }),
        ),
      },
    ],
    // With `revokeOtherSessions` this response already carries the new session's cookies.
    after: [
      {
        matcher: (c) => c.path === '/change-password',
        handler: createAuthMiddleware((c) =>
          Promise.resolve(
            void (c.context.newSession || expireCookie(c, c.context.authCookies.sessionData)),
          ),
        ),
      },
      // Chunks go on every request after this one: a big enough user would pass the server's header limit and be locked out with 431s.
      {
        matcher: () => true,
        handler: createAuthMiddleware((c) => {
          const out = (c.context as { responseHeaders?: Headers }).responseHeaders
          const all = out?.getSetCookie() ?? []
          if (out && all.some(oversized)) {
            out.delete('set-cookie')
            for (const line of all) if (!oversized(line)) out.append('set-cookie', line)
          }
          return Promise.resolve()
        }),
      },
    ],
  },
}

/** `createAuth({ api })`: Better Auth's `jwt` options, and which server functions take a bearer token. */
export interface ApiAccess extends JwtOptions {
  /** The server functions a bearer token may call, as a function so this module needn't load them first. No others read it. */
  functions?: () => unknown[]
}
type Found = NonNullable<
  Awaited<ReturnType<ReturnType<typeof betterAuth<BetterAuthOptions>>['api']['getSession']>>
>
type Session = { user: Found['user'] | null; session: Found['session'] | null }
/** What a token of ours carries: Better Auth's claims, the session it came from, and the user's fields. */
type Claims = {
  sub: string
  sid: string
  iss?: string
  aud?: string | string[]
  exp?: number
  iat?: number
} & Record<string, unknown>
/** The calls made here. The `jwt` plugin is optional, so `verifyJWT` isn't in the instance's own type. */
interface Methods {
  verifyJWT(input: { body: { token: string } }): Promise<{ payload: Claims | null }>
  getSession(input: {
    headers: Headers
    returnHeaders: true
    query?: { disableCookieCache: boolean }
  }): Promise<{ headers: Headers; response: Found | null }>
}
type Signed = Parameters<NonNullable<NonNullable<JwtOptions['jwt']>['definePayload']>>[0]

const buildSecret = () =>
  Array.from(crypto.getRandomValues(new Uint8Array(32)), (x) =>
    x.toString(16).padStart(2, '0'),
  ).join('')

/** `createAuth`: the database, the secret, and any Better Auth option on top. */
export interface AuthOptions<S extends Record<string, unknown>, O extends BetterAuthOptions> {
  db: { $kerf: DbHandle }
  /** The tables, Better Auth's included, for a data layer that needs them. */
  schema?: S
  /** 32+ characters (A001 in production). */
  secret?: string | undefined
  /** The rest of Better Auth's options; they win over the defaults here. */
  options?: O
  /** Short-lived JWTs for other services and API clients, with a public JWKS: Better Auth's `jwt` options. `false` turns it off. */
  api?: ApiAccess | false
}

function sessionReader(
  auth: {
    $context: Promise<{
      internalAdapter: {
        listSessions(
          user: string,
          options: { onlyActiveSessions: boolean },
        ): Promise<{ id: string }[]>
      }
    }>
  },
  methods: Methods,
  claims: { issuer?: string | undefined; audience?: string | string[] | undefined },
  functions: (() => unknown[]) | undefined,
  api: ApiAccess | false | undefined,
) {
  /** Who a token says, for a function that takes one. A write also needs the session behind it to still be there. */
  async function bearer(token: string, read: boolean): Promise<Session> {
    // Unchecked, Better Auth would skip `iss` and `aud`: with no URL configured, no token is good.
    if (!claims.issuer || !claims.audience) return ANONYMOUS
    const { payload } = await methods.verifyJWT({ body: { token } })
    if (!payload) return ANONYMOUS
    if (!read) {
      const live = await (
        await auth.$context
      ).internalAdapter.listSessions(payload.sub, { onlyActiveSessions: true })
      if (!live.some((s) => s.id === payload.sid)) return ANONYMOUS
    }
    const { iss: _iss, aud: _aud, exp: _exp, iat: _iat, sub, sid: _sid, ...user } = payload
    return { user: { ...user, id: sub } as unknown as Found['user'], session: null }
  }

  const marked = (pathname: string) => {
    if (!functions || !pathname.startsWith(FN)) return false
    const id = pathname.slice(FN.length)
    return functions().some((f) => encodeURIComponent((fnOf(f) as { $id: string }).$id) === id)
  }

  return async function session(request: Request): Promise<Session> {
    const read = request.method === 'GET' || request.method === 'HEAD'
    const { pathname } = new URL(request.url)
    const token = request.headers.get('authorization')?.match(BEARER)?.[1]
    if (token && api !== false && marked(pathname)) return bearer(token, read)
    if (!SESSION.test(request.headers.get('cookie') ?? '')) return ANONYMOUS
    const { headers, response: s } = await methods.getSession({
      headers: request.headers,
      returnHeaders: true,
      ...(!(read && !HELD.test(pathname)) && { query: { disableCookieCache: true } }),
    })
    // A fresh cache cookie, a slid expiry or a dead session's removal. Not `forward`: who's signed in hasn't changed.
    // A socket's re-check runs inside whichever request poked it, and its cookies are that socket's, not this response's.
    const scope = currentScope() as { request?: Request; headers?: Headers } | undefined
    if (scope?.headers && scope.request === request)
      for (const c of headers.getSetCookie()) scope.headers.append('set-cookie', c)
    return { user: s?.user ?? null, session: s?.session ?? null }
  }
}

function requireStore(db: { $kerf: DbHandle }, options: BetterAuthOptions | undefined) {
  const handle = db.$kerf
  if (options?.database) for (const name of TABLES) handle.exempt.add(name)
  else
    throw new StartError(
      'A005',
      'Better Auth has no store',
      "pass `options.database`: `drizzleAuth(db, schema)` from @kerf-js/start/auth/drizzle, or your data layer's adapter",
    )
}

/** The `jwt` plugin: a new signing key every 30 days; old ones keep verifying for Better Auth's grace period (30 days). */
function apiTokens(access: Omit<ApiAccess, 'functions'>, claims: JwtOptions['jwt']) {
  return jwt({
    ...access,
    jwks: { rotationInterval: ROTATE, ...access.jwks },
    jwt: claims,
    disableSettingJwtHeader: true,
  })
}

/** A production server's secret (A001) and its own URL (A007). */
function checkServer(secret: string | undefined, origin: unknown) {
  if (process.env.NODE_ENV !== 'production') return
  if ((secret?.length ?? 0) < 32)
    throw new StartError(
      'A001',
      'the auth secret is missing or under 32 characters',
      "set `BETTER_AUTH_SECRET` (`openssl rand -base64 32`) in the server's environment",
    )
  // Without it Better Auth takes its origin from each request's Host header: a forged Host would steer the links in
  // reset and verification emails, and the origin check, to another site.
  if (!origin)
    throw new StartError(
      'A007',
      "the auth server's own URL is missing",
      "set `BETTER_AUTH_URL` (`https://your.site`) in the server's environment, or pass `options.baseURL`",
    )
}

/** A Better Auth instance with Kerf's defaults, on the store `options.database` names. */
export function createAuth<
  S extends Record<string, unknown>,
  const O extends BetterAuthOptions = {},
>({ db, secret, options, api }: AuthOptions<S, O>) {
  requireStore(db, options)
  const { functions, ...access } = api || {}
  const origin =
    typeof options?.baseURL === 'string' ? options.baseURL : process.env.BETTER_AUTH_URL
  const claims = {
    expirationTime: '15m',
    issuer: origin,
    audience: origin,
    ...access.jwt,
    // Which session a token came from, so a write can ask whether it still exists.
    definePayload: async (s: Signed) => ({
      ...((await access.jwt?.definePayload?.(s)) ?? s.user),
      sid: s.session.id,
    }),
  }
  const auth = betterAuth({
    // A build loads this module with no environment, and in production Better Auth refuses to start without a secret: the
    // build gets one of its own, since nothing it makes is signed. A server still needs the real one (A001).
    secret: secret ?? (process.env.KERF_BUILD ? buildSecret() : undefined),
    // A build's prerender holds no environment; a server takes `BETTER_AUTH_URL`, or the request's origin.
    ...(process.env.KERF_BUILD && { baseURL: 'http://localhost' }),
    telemetry: { enabled: false },
    ...options,
    ...mailed(options),
    // Login stays an opaque token in the database. This only spares reads of it, for a window: see `session()`.
    session: {
      ...options?.session,
      cookieCache: {
        enabled: true,
        maxAge: 300,
        strategy: 'compact',
        ...options?.session?.cookieCache,
      },
    },
    // Signing a JWT on every session read would put a query back on each page, and login has no use for one.
    plugins: [
      ...(options?.plugins ?? []),
      cacheRules,
      ...(api === false ? [] : [apiTokens(access, claims)]),
    ],
    // The server stamps this header from the socket (server.tsx), so rate limits aren't one bucket for everyone.
    // Its schema check runs when this module loads. On Kysely that connects, in a build, and before a fresh database has
    // had kerf's migrations. Q014 covers a schema that doesn't match, so it's off unless you turn it on.
    advanced: {
      ...options?.advanced,
      database: { validateSchema: false, ...options?.advanced?.database },
      ipAddress: { ipAddressHeaders: [CLIENT_IP], ...options?.advanced?.ipAddress },
    },
  })
  const methods = auth.api as unknown as Methods

  return Object.assign(auth, {
    basePath: options?.basePath,
    /**
     * With no session cookie it's `null` without a query, so anonymous pages don't touch the database. A page or query
     * reads the signed cookie cache; a mutation (not GET) and anything that outlives the request read the database, so a
     * revoked session may be shown a page for the cache's window but can't write.
     */
    session: sessionReader(auth, methods, claims, functions, api),
    $kerf: {
      /** On the first request (never in a build, which holds no secrets). */
      check: () => checkServer(secret, origin ?? options?.baseURL),
    },
  })
}
