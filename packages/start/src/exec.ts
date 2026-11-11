// The server's executor for queries and mutations (research 27 §3–§4). No runtime imports beyond data.ts, so the
// same code runs in the request handler (server.tsx, which finds the scope through AsyncLocalStorage) and in
// @kerf-js/core/test's in-process fake transport.
//
//   request scope  key → entry (promise, then value and tags): a query runs at most once per request; loaders, every
//                  render pass of a streamed page and a mutation's refreshes share it. Its resolved entries are the
//                  page's `#kerf-cache`.
//   shared store   only for `cache: { life }`: a value is valid while every tag's version still matches (a mutation
//                  bumps the versions of the tags it invalidates).

import { shapeTree } from './shape.mjs'
import {
  enter,
  fns,
  isRedirect,
  keyOf,
  runtime,
  StartError,
  type Answer,
  type Context,
  type Fn,
  type Wire,
  type Life,
} from './data'

import {
  createScope,
  finishScope,
  finishing,
  rereads,
  frame,
  memoryStore,
  defaultStore,
  type Scope,
  type ScopeEntry,
  type Touched,
} from './exec/scope'
import { guard, dbError, signedIn } from './exec/errors'
import {
  tracker,
  untouched,
  missedTags,
  reads,
  liveQueries,
  missedPokes,
  missedFeed,
} from './exec/touch'
import { validate, formInput, checked, checkTags } from './exec/validation'
import { landed, shown, said } from './exec/landing'
import { remember, rewarm, warms } from './exec/warm'
import { callImpl } from './exec/impl'
import { once } from './exec/once'
import { limitCall } from './exec/limit'
export {
  createScope,
  finishScope,
  finishing,
  frame,
  memoryStore,
  defaultStore,
  guard,
  signedIn,
  dbError,
  liveQueries,
  missedFeed,
  validate,
  checkTags,
  shown,
  said,
}
export type {
  Scope,
  ScopeEntry,
  ScopeOptions,
  Touched,
  FormFailure,
  MediaServer,
  Store,
  Stored,
} from './exec/scope'

const LIFE: Record<Exclude<Life, number>, number> = {
  seconds: 1,
  minutes: 60,
  hours: 3600,
  days: 86_400,
  max: Infinity,
}
const seconds = (life: Life = 'minutes') => (typeof life === 'number' ? life : LIFE[life])
const storeOf = (scope: Scope) => scope.options.store ?? defaultStore

// ---- queries --------------------------------------------------------------------------------------------------

/** The value now if this request already has it, else the promise: what a query resource's fetcher returns in SSR. */
export function readQuery(scope: Scope, fn: Fn, input: unknown): unknown {
  const e = fetchEntry(scope, fn, input)
  if (!e.done) return landed(scope, e)
  if (e.e !== undefined) throw shown(e.e, scope)
  return e.v
}

const trees = new WeakMap<Fn, { tree: unknown }>()
/** A query's shape tree, once per definition. */
export function shapeOf(fn: Fn): unknown {
  let t = trees.get(fn)
  if (!t) trees.set(fn, (t = { tree: shapeTree(fn.def) }))
  return t.tree
}

export const fetchQuery = (scope: Scope, fn: Fn, input: unknown): Promise<ScopeEntry> => {
  const e = fetchEntry(scope, fn, input)
  const tags = scope.tags
  return e.p.then((x) => (tags && x.tags.forEach((t) => tags.add(t)), x))
}

function fetchEntry(scope: Scope, fn: Fn, input: unknown): ScopeEntry {
  if (fn.kind !== 'query')
    throw new StartError(
      'Q009',
      `\`${fn.$id}\` is a mutation, not a query`,
      'call it as a function, from a handler',
    )
  const key = keyOf(fn.$id, input)
  const e = scope.entries.get(key)
  if (e) return e
  const entry: ScopeEntry = { id: fn.$id, input, tags: [], p: undefined as never }
  entry.p = (async () => {
    const valid = await validate(fn, input)
    entry.tags = await tagsOf(fn, valid, scope)
    // a preview's reads are its own: never served from the shared store, never written to it
    const cached = scope.preview ? undefined : fn.def.cache
    const store = storeOf(scope)
    // Checked before the shared cache, so a value stored for one user is never answered to no one.
    const early = signedIn(fn) || cached?.scope ? await scope.ctx() : undefined
    if (early) await guard(fn, cached ? shared(early, fn, scope) : early)
    const stored = cached?.scope
      ? `${key}@${String((early as { user?: { id?: string | number } } | undefined)?.user?.id ?? '')}`
      : key
    /** Run the query and store what it returns. */
    const compute = async () => {
      const versions = cached ? await store.versions(entry.tags) : []
      const ctx = early ?? (await scope.ctx())
      const touched = tracker(scope)
      const added: string[] = []
      const v = await call(scope, fn, valid, cached ? shared(ctx, fn, scope) : ctx, {
        touched,
        added,
      })
      const fresh = [...new Set(added)].filter((t) => !entry.tags.includes(t))
      if (fresh.length) {
        entry.tags.push(...fresh)
        if (cached) versions.push(...(await store.versions(fresh)))
      }
      if (scope.options.dev) await checked(v, fn, scope)
      if (touched) {
        untouched(fn, touched.read, entry.tags, scope)
        missedTags(fn, 'read', touched.read, entry.tags, scope)
        reads.set(fn.$id, touched.read)
      }
      if (cached) {
        await store.set(stored, {
          v,
          tags: entry.tags,
          versions,
          expires: Date.now() + seconds(cached.life) * 1000,
        })
        if (warms(fn)) remember(stored, fn, input, entry.tags)
      }
      return v
    }
    if (!cached) return compute()
    const hit = await store.get(stored)
    if (hit && hit.expires > Date.now() && same(hit.versions, await store.versions(hit.tags)))
      return hit.v
    const done = await once(stored, async () => ({ v: await compute(), tags: entry.tags }))
    entry.tags = [...done.tags]
    return done.v
  })().then(
    (v) => Object.assign(entry, { done: true, v }),
    (err) => {
      err = afterStart(err, scope, fn)
      Object.assign(entry, { done: true, e: err })
      throw err
    },
  )
  entry.p.catch(() => {}) // a failure surfaces where the value is read
  scope.entries.set(key, entry)
  return entry
}

/** A `redirect()` after the page started streaming can't change the status: Q007 says so, with where to move it. */
function afterStart(err: unknown, scope: Scope, fn: Fn): unknown {
  if (isRedirect(err) && scope.started) {
    const message = `\`${fn.$id}\` called \`redirect('${err.href}')\` after the page started streaming: the status is already sent`
    scope.options.onDiagnostic?.({ code: 'Q007', severity: 'error', message })
    err = new StartError(
      'Q007',
      message,
      `call \`${fn.$id.replace(/\..*$/, '')}.fetch()\` in the route's \`load\`, which runs before the first byte`,
    )
  }
  return err
}

/** A query's tags. One that takes `ctx` is one user's, so it reads `ctx`; a signed-out caller fails here, as `guard` would. */
export async function tagsOf(fn: Fn, input: unknown, scope: Pick<Scope, 'ctx'>): Promise<string[]> {
  const tags = fn.def.tags
  if (typeof tags !== 'function') return [...(tags ?? [])]
  if (tags.length < 2) return [...tags(input)]
  const ctx = await scope.ctx()
  await guard(fn, ctx)
  return [...tags(input, ctx)]
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i])

const OWN = new Set([
  '$id',
  'auth',
  'cache',
  'errors',
  'impl',
  'input',
  'invalidates',
  'live',
  'optimistic',
  'output',
  'run',
  'shape',
  'tags',
])

/** An option from `FnOptions` is a promise to enforce something: with the plugin gone, the call stops rather than runs open. */
function claimed(fn: Fn, scope: Scope) {
  for (const k in fn.def) {
    if (OWN.has(k) || scope.options.extensions?.some((e) => e.options?.includes(k))) continue
    throw new StartError(
      'P101',
      `\`${fn.$id}\` sets \`${k}\`, and no \`server.extension\` enforces it`,
      'add the plugin that provides it to `plugins`, with its `src/<key>.server.ts`',
      { status: 500 },
    )
  }
}

async function call(
  scope: Scope,
  fn: Fn,
  input: unknown,
  ctx: Context,
  track: { touched?: Touched | undefined; added?: string[] } = {},
) {
  const { touched } = track
  const added = track.added ?? []
  await guard(fn, ctx)
  await limitCall(fn, ctx, scope, storeOf(scope))
  claimed(fn, scope)
  try {
    for (const e of scope.options.extensions ?? [])
      await e.guard?.({ id: fn.$id, kind: fn.kind, def: fn.def }, ctx)
  } catch (e) {
    throw dbError(e)
  }
  const replaced = scope.options.handlers?.get(fn.$id)
  // Awaited inside the frame: a Drizzle query is a thenable, and only runs when something awaits it.
  const run = async () =>
    await (replaced
      ? replaced(input, ctx)
      : fn.def.impl
        ? callImpl(fn, input, ctx, scope, { touched, added })
        : fn.def.run!({ input, ctx }))
  let v: unknown
  try {
    v = await (touched ? enter(Object.create(scope, { touched: { value: touched } }), run) : run())
  } catch (e) {
    throw dbError(e)
  }
  // oxlint-disable-next-line typescript/only-throw-error -- a returned redirect takes the same path as a thrown one
  if (isRedirect(v)) throw v
  return v
}

/** A cached query's ctx: no request, response or user. Its value is shared by every user (Q006). With `scope: 'user'`, one value per user: `ctx.user` is allowed. */
function shared(ctx: Context, fn: Fn, scope: Scope): Context {
  const own = fn.def.cache?.scope === 'user'
  return new Proxy(ctx, {
    get(t, k, r) {
      const personal = scope.options.extensions?.some((e) => e.personal?.includes(String(k)))
      if (own && (k === 'user' || k === 'session' || personal)) return Reflect.get(t, k, r)
      if (k === 'request' || k === 'response' || k === 'user' || k === 'session' || personal)
        throw new StartError(
          'Q006',
          `\`${fn.$id}\` is cached (\`cache: { life }\`) and reads \`ctx.${String(k)}\`: its value would be shared by every user`,
          'drop `cache`, or pass the value as input',
        )
      return Reflect.get(t, k, r)
    },
  })
}

// ---- mutations --------------------------------------------------------------------------------------------------

/** Run a mutation; then refresh the listed queries whose tags it invalidated (single-flight, research 27 §3). */
export async function runMutation(
  scope: Scope,
  fn: Fn,
  input: unknown,
  refresh: [string, unknown][],
  form?: boolean,
): Promise<Answer> {
  if (fn.kind !== 'mutation')
    throw new StartError(
      'Q009',
      `\`${fn.$id}\` is a query, not a mutation`,
      `\`${fn.$id.replace(/\..*$/, '')}.fetch(input)\``,
    )
  if (scope.request.method === 'GET' || scope.request.method === 'HEAD')
    throw new StartError(
      'Q004',
      `mutation \`${fn.$id}\` called while the server handles a GET (\`load\`, a page render or a query)`,
      'call mutations from handlers or other mutations; GET handlers must be side-effect free',
      { status: 500 },
    )
  const valid = await (form ? formInput(fn, input) : validate(fn, input))
  const touched = tracker(scope)
  const added: string[] = []
  const v = await call(scope, fn, valid, await scope.ctx(), { touched, added })
  if (scope.options.dev) await checked(v, fn, scope)
  const declared =
    typeof fn.def.invalidates === 'function'
      ? fn.def.invalidates(valid, v)
      : (fn.def.invalidates ?? [])
  await invalidate(scope, [...declared, ...added])
  const tags = [...scope.invalidated]
  if (touched) {
    missedTags(fn, 'write', touched.write, tags, scope)
    missedPokes(fn, touched.write, tags, scope)
  }
  // in a preview, refreshes read as the next page will: with the preview this response leaves on (or turned off)
  const next = rereads(scope)
  const reader = next ? createScope(next, scope.options) : scope
  try {
    return { v, t: tags, c: await enter(reader, () => refreshed(reader, refresh, tags)) }
  } finally {
    if (reader !== scope) await finishScope(reader)
  }
}

async function refreshed(scope: Scope, refresh: [string, unknown][], tags: string[]) {
  const c: Wire[] = []
  for (const [id, inp] of refresh) {
    const q = fns.get(id)
    if (!q || q.kind !== 'query') continue
    let qtags: string[]
    try {
      const vi = await validate(q, inp)
      qtags = await tagsOf(q, vi, scope)
    } catch {
      continue
    }
    if (!qtags.some((t) => tags.includes(t))) continue
    try {
      const e = await fetchQuery(scope, q, inp)
      c.push([id, inp, e.v, e.tags])
    } catch {} // the client refetches it and sees the error there
  }
  return c
}

/** Drop `tags` for the rest of this request and bump them in the shared store. */
/** Run a query or mutation by id as this scope's caller, guards and all, as a browser call would (`@kerf-js/agent`). */
export async function callById(scope: Scope, id: string, input: unknown): Promise<unknown> {
  const fn = fns.get(id)
  if (!fn || (fn.kind !== 'query' && fn.kind !== 'mutation'))
    throw new StartError('Q019', `no query or mutation \`${id}\``, 'call one by its `$id`', {
      status: 404,
    })
  return fn.kind === 'query'
    ? (await fetchQuery(scope, fn, input)).v
    : (await runMutation(scope, fn, input, [])).v
}

export async function invalidate(scope: Scope, tags: string[]) {
  if (!tags.length) return
  for (const t of tags) scope.invalidated.add(t)
  for (const [k, e] of scope.entries)
    if (e.tags.some((t) => tags.includes(t))) scope.entries.delete(k)
  await storeOf(scope).bump(tags)
  if (!scope.preview)
    rewarm(scope, tags, fetchQuery, (request) => createScope(request, scope.options))
  // After the bump, and after `run`: a refetch reads committed data and misses the shared cache (research 30 §5).
  // A bus that's down costs open pages a refresh, not this request its result.
  await runtime.poke?.(tags, scope.request.headers.get('x-kerf-conn')).catch((e) =>
    scope.options.onDiagnostic?.({
      code: 'E_RT',
      severity: 'error',
      message: `poke of ${tags.join(', ')} failed: ${e instanceof Error ? e.message : e}`,
    }),
  )
}
