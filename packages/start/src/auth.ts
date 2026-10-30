// `@weft/start/auth`: what weft needs from any auth provider (research 34 §5). A provider is `src/auth.server.ts`'s default
// export: `handler` serves its routes under `basePath`, and `session` says who a request is. Nothing here knows Better
// Auth (`@weft/start/auth/better-auth`, the default), so a hand-written provider has no private path to work around.

import { FnError, type Context } from './data'

export interface AuthProvider<U = unknown, S = unknown> {
  /** Serves everything under `basePath`. */
  handler(request: Request): Promise<Response> | Response
  /** Who this request is. Anonymous is `{ user: null, session: null }`, and should cost no query. */
  session(request: Request): Promise<{ user: U | null; session: S | null }>
  /** Where `handler` is mounted (default `/api/auth`). */
  basePath?: string
  $weft?: {
    /** On the first request, never in a build: throw for a server that can't run safely. */
    check(): void
  }
}

/** A provider you wrote: checks its shape, and types `ctx.user` from your `session`. */
export function defineAuth<U, S>(provider: AuthProvider<U, S>): AuthProvider<U, S> {
  return provider
}

/** `{ user, session }` for `ctx` (`src/context.server.ts`), from any provider. */
export const session = <A extends Pick<AuthProvider<any, any>, 'session'>>(auth: A, request: Request): ReturnType<A['session']> => auth.session(request) as ReturnType<A['session']>

const changed = new WeakSet<Headers>()

/** `forward` put a provider's cookie on this response, so who's signed in may have changed. */
export const sessionChanged = (headers: Headers) => changed.has(headers)

/**
 * Finish a provider's Response (Better Auth's with `asResponse: true`): its cookies go on this response, so a redirect
 * after it is a full load, and a failure rejects with the provider's message (`e.message` on the client).
 */
export async function forward(ctx: Context, call: Response | Promise<Response>): Promise<any> {
  const res = await call
  for (const c of res.headers.getSetCookie()) {
    ctx.response.headers.append('set-cookie', c)
    changed.add(ctx.response.headers)
  }
  const body = await res.json().catch(() => null)
  if (!res.ok) throw new FnError({ code: body?.code, message: body?.message ?? 'Authentication failed' }, res.status)
  return body
}
