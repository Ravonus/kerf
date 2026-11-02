// The server's executor for queries and mutations (research 27 §3–§4). No runtime imports beyond data.ts, so the
// same code runs in the request handler (server.tsx, which finds the scope through AsyncLocalStorage) and in
// @weft-js/core/test's in-process fake transport.
//
//   request scope  key → entry (promise, then value and tags): a query runs at most once per request; loaders, every
//                  render pass of a streamed page and a mutation's refreshes share it. Its resolved entries are the
//                  page's `#weft-cache`.
//   shared store   only for `cache: { life }`: a value is valid while every tag's version still matches (a mutation
//                  bumps the versions of the tags it invalidates).

import { shapeTree } from './shape.mjs'
import type { MediaAsset } from '@weft-js/core/media'
import type { ServerExtension } from './extension'
import { FnError, enter, fns, isRedirect, keyOf, runtime, StartError, type Answer, type Context, type Fn, type Life, type SchemaIssue, type Wire } from './data'
import { unavailable } from './db/core'

export interface ScopeEntry {
  id: string
  input: unknown
  p: Promise<ScopeEntry>
  done?: boolean
  v?: unknown
  e?: unknown
  tags: string[]
}

export interface Scope {
  request: Request
  entries: Map<string, ScopeEntry>
  /** Tags a mutation or `invalidate()` dropped during this request. */
  invalidated: Set<string>
  /** Response headers the functions set (cookies), merged into the response. */
  headers: Headers
  /** The page's first byte went out: a redirect can't change the status any more (Q007). */
  started?: boolean
  /** The tags of the queries a route level's `load` read (a frame per loader; research 27 §4). */
  tags?: Set<string>
  /** Dev: the tables this function's statements read and wrote (a frame per `run`; research 28 §2). */
  touched?: Touched
  /** A no-JS form POST that failed: `<Form>` renders it into the page (research 29 §5). */
  form?: FormFailure
  /** The render read a live query or a stream: the page carries the realtime cursor (research 30 §1). */
  live?: boolean
  ctx(): Promise<Context>
  options: ScopeOptions
}

export interface Touched { read: Set<string>; write: Set<string> }

export interface FormFailure { id: string; key?: string; values: Record<string, unknown>; errors: Record<string, string>; message?: string | undefined; status: number }

/** The `media.server@1` provider (`@weft-js/plugin-media/server`, research 29 §6). */
export interface MediaServer {
  ingest(bytes: Uint8Array, options: { name?: string }): Promise<MediaAsset>
  serve(want: { hash: string; width: number; format: string; accept: string }): Promise<{ bytes: Uint8Array; type: string; width: number; format: string; negotiated: boolean; temporary?: boolean } | null>
}

export interface ScopeOptions {
  /** The app's context (`src/context.server.ts`). */
  context?: ((args: { request: Request }) => object | Promise<object>) | undefined
  store?: Store | undefined
  /** Tests (@weft-js/core/test `net.handle`): a replacement `run` by function id. */
  handlers?: Map<string, (input: unknown, ctx: Context) => unknown>
  onDiagnostic?: ((d: { code: string; severity: string; message: string }) => void) | undefined
  dev?: boolean | undefined
  media?: (() => Promise<MediaServer> | undefined) | undefined
  /** What plugins add through `server.extension` (extension.ts). */
  extensions?: ServerExtension[] | undefined
}

export function createScope(request: Request, options: ScopeOptions = {}): Scope {
  const headers = new Headers()
  let ctx: Promise<Context> | undefined
  return {
    request, entries: new Map(), invalidated: new Set(), headers, options,
    ctx: () => (ctx ??= Promise.resolve().then(() => options.context?.({ request }) ?? {}).then(app => extended({ ...app, request, response: { headers }, media: mediaApi(options) }, options), e => { throw dbError(e) })),
  }
}

/** Each extension's part of `ctx`, once the app's is there: an extension reads `ctx.user` to say what it adds. */
function extended(ctx: Context, options: ScopeOptions): Context {
  for (const e of options.extensions ?? []) Object.assign(ctx, e.context?.(ctx))
  return ctx
}

/** `ctx.media`. A refusal is the user's answer, with its own status; `<Form>` shows it. */
const mediaApi = (options: ScopeOptions): Context['media'] => ({
  async ingest(file, { name } = {}) {
    const server = await options.media?.()
    if (!server) throw new StartError('M017', '`ctx.media` needs a `media.server` provider', 'add `media()` from `@weft-js/plugin-media` to `plugins` in weft.config.ts', { status: 500 })
    const bytes = file instanceof Uint8Array ? file : new Uint8Array(await file.arrayBuffer())
    try {
      return await server.ingest(bytes, { name: name ?? (file as File).name })
    } catch (e) {
      const { code, message } = e as Error & { code?: string }
      throw code ? new StartError(code, message, undefined, { status: 422 }) : e
    }
  },
})

/** A child scope for one loader: the same entries, its own `tags` collector. */
export const frame = (scope: Scope): Scope => Object.create(scope, { tags: { value: new Set<string>() } })

// ---- the shared tagged cache --------------------------------------------------------------------------------------

/** Where `cache: { life }` values live. Memory by default; Nitro storage (fs, KV, Redis) plugs in here. */
export interface Store {
  get(key: string): Stored | undefined | Promise<Stored | undefined>
  set(key: string, value: Stored): void | Promise<void>
  /** The current version of each tag (0 for one never bumped). */
  versions(tags: string[]): number[] | Promise<number[]>
  bump(tags: string[]): void | Promise<void>
}
export interface Stored { v: unknown; tags: string[]; versions: number[]; expires: number }

export function memoryStore(): Store {
  const values = new Map<string, Stored>()
  const tags = new Map<string, number>()
  return {
    get: k => values.get(k),
    set: (k, v) => void values.set(k, v),
    versions: t => t.map(x => tags.get(x) ?? 0),
    bump: t => { for (const x of t) tags.set(x, (tags.get(x) ?? 0) + 1) },
  }
}

const LIFE: Record<Exclude<Life, number>, number> = { seconds: 1, minutes: 60, hours: 3600, days: 86_400, max: Infinity }
const seconds = (life: Life = 'minutes') => (typeof life === 'number' ? life : LIFE[life])
export const defaultStore = memoryStore()
const storeOf = (scope: Scope) => scope.options.store ?? defaultStore

// ---- queries --------------------------------------------------------------------------------------------------

/** The value now if this request already has it, else the promise: what a query resource's fetcher returns in SSR. */
export function readQuery(scope: Scope, fn: Fn, input: unknown): unknown {
  const e = fetchEntry(scope, fn, input)
  if (!e.done) return e.p.then(x => x.v)
  if (e.e !== undefined) throw e.e as Error
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
  return e.p.then(x => (tags && x.tags.forEach(t => tags.add(t)), x))
}

function fetchEntry(scope: Scope, fn: Fn, input: unknown): ScopeEntry {
  if (fn.kind !== 'query') throw new StartError('Q009', `\`${fn.$id}\` is a mutation, not a query`, 'call it as a function, from a handler')
  const key = keyOf(fn.$id, input)
  const e = scope.entries.get(key)
  if (e) return e
  const entry: ScopeEntry = { id: fn.$id, input, tags: [], p: undefined as never }
  entry.p = (async () => {
    const valid = await validate(fn, input)
    entry.tags = await tagsOf(fn, valid, scope)
    const cached = fn.def.cache
    const store = storeOf(scope)
    // Checked before the shared cache, so a value stored for one user is never answered to no one.
    const early = fn.def.auth || cached?.scope ? await scope.ctx() : undefined
    if (early) guard(fn, cached ? shared(early, fn, scope) : early)
    const stored = cached?.scope ? `${key}@${String((early as { user?: { id?: string | number } } | undefined)?.user?.id ?? '')}` : key
    if (cached) {
      const hit = await store.get(stored)
      if (hit && hit.expires > Date.now() && same(hit.versions, await store.versions(hit.tags))) return hit.v
    }
    const versions = cached ? await store.versions(entry.tags) : []
    const ctx = early ?? (await scope.ctx())
    const touched = tracker(scope)
    const added: string[] = []
    const v = await call(scope, fn, valid, cached ? shared(ctx, fn, scope) : ctx, touched, added)
    const fresh = [...new Set(added)].filter(t => !entry.tags.includes(t))
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
    if (cached) await store.set(stored, { v, tags: entry.tags, versions, expires: Date.now() + seconds(cached.life) * 1000 })
    return v
  })().then(
    v => Object.assign(entry, { done: true, v }),
    err => {
      if (isRedirect(err) && scope.started) {
        const message = `\`${fn.$id}\` called \`redirect('${err.href}')\` after the page started streaming: the status is already sent`
        scope.options.onDiagnostic?.({ code: 'Q007', severity: 'error', message })
        err = new StartError('Q007', message, `call \`${fn.$id.replace(/\..*$/, '')}.fetch()\` in the route's \`load\`, which runs before the first byte`)
      }
      Object.assign(entry, { done: true, e: err })
      throw err
    },
  )
  entry.p.catch(() => {}) // a failure surfaces where the value is read
  scope.entries.set(key, entry)
  return entry
}

/** A query's tags. One that takes `ctx` is one user's, so it reads `ctx`; a signed-out caller fails here, as `guard` would. */
export async function tagsOf(fn: Fn, input: unknown, scope: Pick<Scope, 'ctx'>): Promise<string[]> {
  const tags = fn.def.tags
  if (typeof tags !== 'function') return [...(tags ?? [])]
  if (tags.length < 2) return [...tags(input)]
  const ctx = await scope.ctx()
  guard(fn, ctx)
  return [...tags(input, ctx)]
}

const same = (a: number[], b: number[]) => a.length === b.length && a.every((x, i) => x === b[i])

/** A body in another process (research 36): what it adds to the tags and reports it touched arrive with the value. */
async function callImpl(fn: Fn, input: unknown, ctx: Context, scope: Scope, touched: Touched | undefined, added: string[]) {
  const { value, tags, touched: tables } = await fn.def.impl!.call({ fn, input, ctx, request: scope.request })
  added.push(...tags)
  if (touched) for (const t of tables) touched[fn.kind === 'query' ? 'read' : 'write'].add(t)
  return value
}

const OWN = new Set(['$id', 'auth', 'cache', 'errors', 'impl', 'input', 'invalidates', 'live', 'optimistic', 'output', 'run', 'shape', 'tags'])

/** An option from `FnOptions` is a promise to enforce something: with the plugin gone, the call stops rather than runs open. */
function claimed(fn: Fn, scope: Scope) {
  for (const k in fn.def) {
    if (OWN.has(k) || scope.options.extensions?.some(e => e.options?.includes(k))) continue
    throw new StartError('P101', `\`${fn.$id}\` sets \`${k}\`, and no \`server.extension\` enforces it`, 'add the plugin that provides it to `plugins`, with its `src/<key>.server.ts`', { status: 500 })
  }
}

async function call(scope: Scope, fn: Fn, input: unknown, ctx: Context, touched?: Touched, added: string[] = []) {
  guard(fn, ctx)
  claimed(fn, scope)
  try {
    for (const e of scope.options.extensions ?? []) await e.guard?.({ id: fn.$id, kind: fn.kind, def: fn.def }, ctx)
  } catch (e) {
    throw dbError(e)
  }
  const replaced = scope.options.handlers?.get(fn.$id)
  // Awaited inside the frame: a Drizzle query is a thenable, and only runs when something awaits it.
  const run = async () => await (replaced ? replaced(input, ctx) : fn.def.impl ? callImpl(fn, input, ctx, scope, touched, added) : fn.def.run!({ input, ctx }))
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

/** `auth: 'user'`: A003 when `ctx` has no `user` at all, A002 when no one is signed in. */
export function guard(fn: Fn, ctx: Context) {
  if (fn.def.auth !== 'user') return
  if (!('user' in ctx)) throw new StartError('A003', `\`${fn.$id}\` has \`auth: 'user'\`, but \`ctx\` has no \`user\``, 'spread `session(auth, request)` into what `src/context.server.ts` returns', { status: 500 })
  if (!(ctx as { user?: unknown }).user) throw new StartError('A002', `\`${fn.$id}\` needs a signed-in user`, 'sign in first, or guard the route with `redirect()` in its `load`', { status: 401 })
}

const DOWN = /^(ECONNREFUSED|ECONNRESET|ENOTFOUND|EHOSTUNREACH|ETIMEDOUT|CONNECT_TIMEOUT|CONNECTION_(CLOSED|ENDED|DESTROYED)|PROTOCOL_CONNECTION_LOST|P100[12])$/

interface Failure { cause?: Failure | null; answer?: { message?: string; code?: string; status: number }; code?: string | number; message?: string }

/** A dropped connection is Q016; a missing table is a migration that wasn't generated or applied (Q014): the driver's error, with the fix. */
export function dbError(e: unknown): unknown {
  const failure = e as Failure | null | undefined
  const cause = failure?.cause ?? failure
  if (failure?.answer) return new FnError(failure.answer, failure.answer.status)
  if (cause instanceof StartError) return cause // Drizzle wraps what a driver throws, the gate's Q016 included
  if (!(e instanceof StartError) && DOWN.test(String(cause?.code ?? failure?.code ?? ''))) return unavailable(e)
  const m = cause?.message ?? ''
  if (e instanceof StartError || !(/no such (table|column)|has no column named/.test(m) || cause?.code === '42P01' || cause?.code === '42703')) return e
  return new StartError('Q014', `the database doesn't match the schema: ${m}`, 'run `weft db generate`, then reload (new migrations apply on the next request)', { status: 500 })
}

type Obj = Record<PropertyKey, unknown>

const tracker = (scope: Scope): Touched | undefined => (scope.options.dev ? { read: new Set(), write: new Set() } : undefined)

/** R105 (dev, once per function): a cached Rust query with tags that named no table, so Q011 has nothing to check it by. */
function untouched(fn: Fn, read: Set<string>, tags: readonly string[], scope: Scope) {
  if (!fn.def.impl || !fn.def.cache || read.size || !tags.length || warned.has(`${fn.$id}:R105`)) return
  warned.add(`${fn.$id}:R105`)
  scope.options.onDiagnostic?.({ code: 'R105', severity: 'warning', message: `\`${fn.$id}\` is cached under ${tags.map(t => `\`${t}\``).join(', ')} and reported no table: nothing can tell whether those tags cover what it reads. Call \`ctx.touch("table")\` in the Rust, or drop \`tags\` if it reads none` })
}

/** Q011 (dev, once per function and table): a table the function touched that no tag names (PLAN §4). */
function missedTags(fn: Fn, verb: 'read' | 'write', tables: Set<string>, tags: readonly string[], scope: Scope) {
  for (const t of tables) {
    const key = `${fn.$id}:${t}`
    if (warned.has(key) || tags.some(x => x === t || x.startsWith(`${t}:`))) continue
    warned.add(key)
    const list = fn.kind === 'query' ? '`tags`' : '`invalidates`'
    scope.options.onDiagnostic?.({ code: 'Q011', severity: 'warning', message: `\`${fn.$id}\` ${verb === 'read' ? 'reads' : 'writes'} table \`${t}\`, but its ${list} don't name it: ${fn.kind === 'query' ? 'a mutation of that table won\'t refresh it' : 'queries of that table stay stale'}. Add \`'${t}'\` to ${list}` })
  }
}
const warned = new Set<string>()

/** Dev: the tables each query last read, and the tags of the queries read with `.live()` (the hub fills it). */
const reads = new Map<string, Set<string>>()
export const liveQueries = new Map<string, string[]>()

/** R003 (dev, once per pair): this mutation wrote what a live query reads, and pokes none of its tags. */
function missedPokes(fn: Fn, write: Set<string>, tags: string[], scope: Scope) {
  for (const [id, own] of liveQueries) {
    const table = [...(reads.get(id) ?? [])].find(t => write.has(t))
    const key = `${fn.$id}>${id}`
    if (!table || warned.has(key) || own.some(t => tags.includes(t))) continue
    warned.add(key)
    scope.options.onDiagnostic?.({ code: 'R003', severity: 'warning', message: `\`${fn.$id}\` writes table \`${table}\`, which live query \`${id}\` reads, but their tags don't intersect (${JSON.stringify(tags)} and ${JSON.stringify(own)}): open pages won't update. Add one of the query's tags to \`invalidates\`` })
  }
}

/** R012 (dev, once per query and table): a live query whose tags won't hear what `changes` reports, or a table it doesn't report. */
export function missedFeed(fn: Fn, tags: string[], tables: string[], report: ScopeOptions['onDiagnostic']) {
  for (const t of reads.get(fn.$id) ?? []) {
    const key = `${fn.$id}~${t}`
    const named = tags.some(x => x === t || x.startsWith(`${t}:`))
    if (warned.has(key) || (named && tables.includes(t))) continue
    warned.add(key)
    report?.({ code: 'R012', severity: 'warning', message: tables.includes(t) ? `live query \`${fn.$id}\` reads table \`${t}\`, but no tag names it: writes from outside the app won't refresh it. Add \`'${t}'\` to its \`tags\`` : `live query \`${fn.$id}\` reads table \`${t}\`, which \`changes\` doesn't list: only mutations refresh it, not writes from outside the app. Add the table to \`dbChanges\`` })
  }
}

/** A cached query's ctx: no request, response or user. Its value is shared by every user (Q006). With `scope: 'user'`, one value per user: `ctx.user` is allowed. */
function shared(ctx: Context, fn: Fn, scope: Scope): Context {
  const own = fn.def.cache?.scope === 'user'
  return new Proxy(ctx, {
    get(t, k, r) {
      const personal = scope.options.extensions?.some(e => e.personal?.includes(String(k)))
      if (own && (k === 'user' || k === 'session' || personal)) return Reflect.get(t, k, r)
      if (k === 'request' || k === 'response' || k === 'user' || k === 'session' || personal)
        throw new StartError('Q006', `\`${fn.$id}\` is cached (\`cache: { life }\`) and reads \`ctx.${String(k)}\`: its value would be shared by every user`, 'drop `cache`, or pass the value as input')
      return Reflect.get(t, k, r)
    },
  })
}

// ---- mutations --------------------------------------------------------------------------------------------------

/** Run a mutation; then refresh the listed queries whose tags it invalidated (single-flight, research 27 §3). */
export async function runMutation(scope: Scope, fn: Fn, input: unknown, refresh: [string, unknown][], form?: boolean): Promise<Answer> {
  if (fn.kind !== 'mutation') throw new StartError('Q009', `\`${fn.$id}\` is a query, not a mutation`, `\`${fn.$id.replace(/\..*$/, '')}.fetch(input)\``)
  if (scope.request.method === 'GET' || scope.request.method === 'HEAD')
    throw new StartError('Q004', `mutation \`${fn.$id}\` called while the server handles a GET (\`load\`, a page render or a query)`, 'call mutations from handlers or other mutations; GET handlers must be side-effect free', { status: 500 })
  const valid = await (form ? formInput(fn, input) : validate(fn, input))
  const touched = tracker(scope)
  const added: string[] = []
  const v = await call(scope, fn, valid, await scope.ctx(), touched, added)
  if (scope.options.dev) await checked(v, fn, scope)
  const declared = typeof fn.def.invalidates === 'function' ? fn.def.invalidates(valid, v) : fn.def.invalidates ?? []
  await invalidate(scope, [...declared, ...added])
  const tags = [...scope.invalidated]
  if (touched) {
    missedTags(fn, 'write', touched.write, tags, scope)
    missedPokes(fn, touched.write, tags, scope)
  }
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
    if (!qtags.some(t => tags.includes(t))) continue
    try {
      const e = await fetchQuery(scope, q, inp)
      c.push([id, inp, e.v, e.tags])
    } catch {} // the client refetches it and sees the error there
  }
  return { v, t: tags, c }
}

/** Drop `tags` for the rest of this request and bump them in the shared store. */
export async function invalidate(scope: Scope, tags: string[]) {
  if (!tags.length) return
  for (const t of tags) scope.invalidated.add(t)
  for (const [k, e] of scope.entries) if (e.tags.some(t => tags.includes(t))) scope.entries.delete(k)
  await storeOf(scope).bump(tags)
  // After the bump, and after `run`: a refetch reads committed data and misses the shared cache (research 30 §5).
  // A bus that's down costs open pages a refresh, not this request its result.
  await runtime.poke?.(tags, scope.request.headers.get('x-weft-conn')).catch(e => scope.options.onDiagnostic?.({ code: 'E_RT', severity: 'error', message: `poke of ${tags.join(', ')} failed: ${e instanceof Error ? e.message : e}` }))
}

// ---- validation and checks ------------------------------------------------------------------------------------

export async function validate(fn: Fn, input: unknown): Promise<unknown> {
  const schema = fn.def.input
  if (!schema) return input
  const r = await schema['~standard'].validate(input)
  if (!r.issues) return r.value
  throw rejected(fn, r.issues)
}

const plainPath = (i: SchemaIssue) => (i.path ?? []).map(p => (typeof p === 'object' ? p.key : p))

function rejected(fn: Fn, list: readonly SchemaIssue[]) {
  const issues = list.map(i => ({ message: i.message, path: i.path && plainPath(i) })) as (SchemaIssue & { path?: PropertyKey[] })[]
  const where = issues.map(i => `${i.path?.length ? i.path.map(String).join('.') + ': ' : ''}${i.message}`).join('; ')
  return new StartError('Q002', `\`${fn.$id}\` rejected its input: ${where}`, 'pass what the schema accepts', { status: 400, issues })
}

/** A form's string as the type it may stand for (research 29 §5): the schema says whether it was wrong. */
function reading(s: string): unknown {
  if (s === '') return undefined
  if (s === 'on' || s === 'true') return true
  if (s === 'false') return false
  return /^-?\d+(\.\d+)?$/.test(s) ? Number(s) : s
}

/**
 * A form sends strings and a schema may want numbers or booleans, and Standard Schema can't say which: each issue
 * on a string tries its obvious reading, then the input is validated again. Fields a reading fixed report nothing; the
 * rest report what the schema says of what was typed (an empty field: its "required", not "expected a string").
 */
async function formInput(fn: Fn, input: unknown): Promise<unknown> {
  const schema = fn.def.input
  if (!schema || !input || typeof input !== 'object') return validate(fn, input)
  const value: Obj = { ...input }
  let left: readonly SchemaIssue[] = []
  for (let i = 0; i < 3; i++) {
    const r = await schema['~standard'].validate(value)
    if (!r.issues) return r.value
    left = r.issues
    let changed = false
    for (const issue of r.issues) {
      const path = plainPath(issue)
      if (!path.length) continue
      let at: Obj | undefined = value
      for (const p of path.slice(0, -1)) {
        const inner: unknown = at?.[p]
        if (!inner || typeof inner !== 'object') { at = undefined; break }
        at = at[p] = (Array.isArray(inner) ? [...inner] : { ...inner }) as Obj
      }
      const k = path.at(-1)!
      const typed = at?.[k]
      if (typeof typed !== 'string') continue
      const next = reading(typed)
      if (next === typed) continue
      if (next === undefined) delete at![k]
      else at![k] = next
      changed = true
    }
    if (!changed) break
  }
  const first = await schema['~standard'].validate(input)
  const where = (i: SchemaIssue) => JSON.stringify(plainPath(i))
  throw rejected(fn, left.map(i => first.issues?.find(o => where(o) === where(i)) ?? i))
}

/** Dev and tests: the value against `output` (C002), and what JSON would change (Q005). */
async function checked(v: unknown, fn: Fn, scope: Scope) {
  serializable(v, fn, scope)
  const schema = fn.def.output
  if (!schema || fn.def.impl) return // `impl`: rust.ts checked what came back, on every call
  const r = await schema['~standard'].validate(v)
  if (r.issues) throw new StartError('C002', `\`${fn.$id}\` returned a value its \`output\` schema rejects: ${r.issues.map(i => `${i.path?.map(p => (typeof p === 'object' ? p.key : p)).join('.') ?? ''}: ${i.message}`).join('; ')}`, 'fix `run`, or the schema', { status: 500 })
}

/** Q005 (dev): what JSON would change on the way to the client. */
function serializable(v: unknown, fn: Fn, scope: Scope) {
  const bad = (x: unknown, path: string): string | undefined => {
    if (x === null || typeof x === 'string' || typeof x === 'boolean') return undefined
    if (typeof x === 'number') return Number.isFinite(x) ? undefined : `${path} is ${x}`
    if (x === undefined) return undefined
    if (typeof x !== 'object') return `${path} is a ${typeof x}`
    if (Array.isArray(x)) {
      for (let i = 0; i < x.length; i++) {
        if (x[i] === undefined) return `${path}[${i}] is undefined (JSON sends null)`
        const b = bad(x[i], `${path}[${i}]`)
        if (b) return b
      }
      return undefined
    }
    const proto: unknown = Object.getPrototypeOf(x)
    if (proto !== Object.prototype && proto !== null) return `${path} is a ${(x as { constructor?: { name?: string } }).constructor?.name ?? 'class instance'}`
    for (const k of Object.keys(x)) {
      const b = bad((x as Obj)[k], `${path}.${k}`)
      if (b) return b
    }
    return undefined
  }
  const b = bad(v, 'result')
  if (b) scope.options.onDiagnostic?.({ code: 'Q005', severity: 'warning', message: `\`${fn.$id}\`'s ${b}: the client gets a different value than the server rendered with. Send plain data (ISO strings, arrays, objects)` })
}

/**
 * Q008 (dev, once): each mutation's static `invalidates` against the tags queries declare. A tags function is called
 * with an input whose every field reads `*`, so `todo:${id}` declares `todo:*`.
 */
export function checkTags(report: (d: { code: string; severity: string; message: string }) => void) {
  const star: unknown = new Proxy({}, { get: (_, k) => (k === Symbol.toPrimitive ? () => '*' : '*') })
  const declared: string[] = []
  for (const f of fns.values()) {
    if (f.kind !== 'query') continue
    try { declared.push(...(typeof f.def.tags === 'function' ? f.def.tags(star) : f.def.tags ?? [])) } catch {}
  }
  const matches = (tag: string) => declared.some(d => d === tag || (d.includes('*') && new RegExp(`^${d.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^]*')}$`).test(tag)) || (tag.includes('*') && d.startsWith(tag.slice(0, tag.indexOf('*')))))
  for (const f of fns.values()) {
    if (f.kind !== 'mutation' || !f.def.invalidates) continue
    let tags: readonly string[]
    try { tags = typeof f.def.invalidates === 'function' ? f.def.invalidates(star, star) : f.def.invalidates } catch { continue }
    for (const t of tags) if (!matches(t)) report({ code: 'Q008', severity: 'warning', message: `\`${f.$id}\` invalidates \`${t}\`, a tag no query declares: nothing refreshes. Fix the tag, or add it to the query's \`tags\`` })
  }
}
