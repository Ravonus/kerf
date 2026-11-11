// Server functions and the client data cache (research 27). `query`/`mutation` definitions live in server modules
// (`src/server/**`, `*.server.ts`); the `weft:start` plugin gives each an id and, for the client, strips everything
// but `optimistic`. One definition is then:
//
//   - on the server: `q.fetch(input)` runs `run` through the request cache (exec.ts), at most once per request;
//   - in a component or scope: `q(input)` is a `Query` (a Resource) reading the client cache. Its fetcher reads the
//     entry's value, so a new server value or an optimistic layer updates every reader in place;
//   - a mutation `m(input)` POSTs, applies `optimistic` layers at once, and settles with the refreshed queries the
//     server sends back in the same response (single-flight).
//
// The cache entry's value is `base` with each pending layer applied. New bases are structurally shared with the old
// one, so unchanged rows keep their identity and `For` keeps them. This module ships to the client; the executor
// (exec.ts) is the server's, and the in-process fake transport @weft-js/core/test turns on loads it on demand. Realtime
// (research 30) costs a query app one method here: `q.live()` imports live.ts on its first call.

import type { MediaAsset } from '@weft-js/core/media'
import { cache, resetRetry } from './data/cache'
import { configureReset, currentScope, runtime } from './data/foundation'
import { StartError } from './data/primitives'
import { resetMutation } from './data/mutation'

export type {
  VerifyOptions,
  StandardSchemaV1,
  SchemaResult,
  SchemaIssue,
  Life,
  Limit,
  AuthScope,
  ImplCall,
  Impl,
  Errors,
  QueryDef,
  ImplQueryDef,
  ImplMutationDef,
  MutationDef,
  Query,
  Mutation,
  LiveStatus,
  LiveMode,
  LiveOptions,
  LiveQuery,
  Fn,
  Wire,
  Answer,
  Transport,
  NetControl,
  QueryRef,
  OptimisticCache,
} from './data/types'
export {
  StartError,
  FnError,
  redirect,
  isRedirect,
  raise,
  invalid,
  fieldsOf,
  decodeForm,
  stable,
  keyOf,
} from './data/primitives'
export type { Redirect } from './data/primitives'
export {
  skip,
  fns,
  runtime,
  rt,
  stale,
  net,
  SUBMIT,
  fnOf,
  currentScope,
  enter,
} from './data/foundation'
export type { Skip } from './data/foundation'
export { http, fakeScope, track } from './data/transport'
export { share, produce } from './data/draft'
export { seed, cache, invalidate } from './data/cache'
export { after, preview } from './data/after'
export { liveApi } from './data/live-api'
export type { LiveApi } from './data/live-api'
export { query, mutation } from './data/definitions'

/**
 * Run a query or mutation by `$id` as the caller of the request in progress: its schema, `auth`, every extension's
 * `guard` and its invalidations, as a browser call would. Server code only: `@weft-js/agent` runs tools this way.
 */
export function serverCall(id: string, input?: unknown): Promise<unknown> {
  const scope = currentScope()
  if (!scope || !runtime.exec)
    return Promise.reject(
      new StartError(
        'Q020',
        `\`serverCall('${id}')\` outside a request`,
        'call it from a query, mutation, `load` or extension route',
        { status: 500 },
      ),
    )
  return runtime.exec.callById(scope, id, input)
}

/**
 * What `run` and `load` get. Augment it with what `src/context.server.ts` returns:
 * `declare module '@weft-js/start' { interface Context { db: Db; user: User | null } }`.
 */
export interface Context {
  request: Request
  /** Headers merged into the response (cookies a sign-in sets). */
  response: { headers: Headers }
  /** Uploads and CMS images (research 29 §6): `ingest` stores the original and returns the record `z.media()` validates. */
  media: { ingest(file: Blob | Uint8Array, options?: { name?: string }): Promise<MediaAsset> }
}

/** The address the server saw (never one a client sent): Better Auth's rate limits key on it. */
export const CLIENT_IP = 'x-weft-client-ip'

/** Options a plugin adds to `query` and `mutation`, by augmenting this; its extension's `guard` reads them. Empty here. */
export interface FnOptions {}

configureReset(() => {
  cache.clear()
  resetRetry()
  resetMutation()
})
