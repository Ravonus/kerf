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

import { untrack } from '@weft-js/core'
import type { MediaAsset } from '@weft-js/core/media'
import { client, peers } from './router'
import { cache, clock, entries, outdate, owed, resetRetry, seed, staleTags } from './data/cache'
import { configureReset, runtime } from './data/foundation'
import { resetMutation } from './data/mutation'
import type { Wire } from './data/types'

export type {
  VerifyOptions,
  StandardSchemaV1,
  SchemaResult,
  SchemaIssue,
  Life,
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
export { liveApi } from './data/live-api'
export type { LiveApi } from './data/live-api'
export { query, mutation } from './data/definitions'

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

/** How old a value can be when its tab comes back and still be left alone. */
const FOCUS = 30_000

if ((import.meta as ImportMeta & { hot?: unknown }).hot)
  client.refreshed = () =>
    untrack(() => {
      for (const e of entries.values()) outdate(e)
    })

configureReset(() => {
  cache.clear()
  resetRetry()
  resetMutation()
})

// ---- start-up ----------------------------------------------------------------------------------------------------

// In the browser, as the first route chunk that uses a query loads (before hydration): the page's entries, and
// whatever a navigation brought before this module loaded.
if (typeof document !== 'undefined' && !runtime.scope) {
  client.seed = seed
  client.now = () => clock
  seed(client.seeds)
  client.seeds = undefined
  const el = document.getElementById('weft-cache')
  if (el) seed(JSON.parse(el.textContent))
  // A stream's chunks say what landed: here is everything so far, and each one's script pushes the next.
  // They were read for this page, so anything written here since is newer.
  const landed = ((globalThis as { $wc?: { c: Wire[] }[] }).$wc ||= []),
    since = clock
  for (const l of landed) seed(l.c, since)
  landed.push = (...l) => {
    for (const x of l) seed(x.c, since)
    return Array.prototype.push.apply(landed, l)
  }
  const later: string[] = []
  const back = () => {
    if (document.hidden) return
    const old = performance.now() - FOCUS
    // Showing and focus can come apart: one already stale is being read, and marking it again would throw that read away.
    untrack(() => {
      for (const e of entries.values())
        if (e.readers && e.has.value && e.at < old && !e.stale.value) outdate(e)
    })
    if (later.length) staleTags(later.splice(0))
    owed()
  }
  // A hidden tab reads nothing until it shows: every open tab refetching on every write is what this would cost otherwise.
  if (peers)
    peers.onmessage = (m) => {
      if (!m.data) return // the session changed: run.tsx reloads
      if (document.hidden) later.push(...m.data)
      else staleTags(m.data)
    }
  addEventListener('focus', back)
  addEventListener('online', owed)
  document.addEventListener('visibilitychange', back)
}
