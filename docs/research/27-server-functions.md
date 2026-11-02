# 27. Server functions, the tagged cache and `redirect()`: `@weft-js/start` (Phase 3, second slice)

Status: **designed and built 2026-10-29** in `packages/start` (`src/data.ts`, `src/exec.ts`, `src/server.tsx`,
`src/vite.mjs`), with one option added to `resource` in `packages/weft/src/async.ts` and the fake transport in
`@weft-js/core/test`. Inputs: PLAN §4 and §4.5, research 02 §3–§4 (server functions, the five caching primitives), 14 §3
(server state stays in the query cache, optimistic overlays, S011), 25 (routing, streaming, the first slice).

This note fixes the API and the diagnostics, and records what was built, the decisions behind it, sizes and gaps.
Drizzle, Better Auth, `create-weft --db/--auth` and the Node/Bun/Deno CI matrix are the next slice; §9 says where
each plugs in.

## 1. The API

```ts
// src/server/todos.ts: a server module (src/server/** or *.server.ts)
import { query, mutation, redirect } from '@weft-js/start'
import { z } from 'zod'

export const listTodos = query({
  tags: ['todos'],                                   // what invalidates it (client cache, request cache, shared cache)
  cache: { life: 'minutes' },                        // omit → never cached across requests (per-request dedupe only)
  run: ({ ctx }) => ctx.db.todos.list(),
})

export const getTodo = query({
  input: z.object({ id: z.string() }),               // any Standard Schema; validated on the server
  tags: ({ id }) => ['todos', `todo:${id}`],
  run: async ({ input, ctx }) => (await ctx.db.todos.get(input.id)) ?? redirect('/todos'),
})

export const addTodo = mutation({
  input: z.object({ title: z.string().min(1) }),
  invalidates: ['todos'],                            // queries with these tags are refreshed in the same response
  optimistic: ({ input }, cache) =>                  // client only: kept in the stub, never run on the server
    cache.update(listTodos, undefined, list => { list.push({ id: `tmp:${input.title}`, title: input.title, done: false }) }),
  run: ({ input, ctx }) => ctx.db.todos.add(input.title),
})
```

```tsx
// a component or a defineState setup (anything with an owner)
const todos = listTodos()                            // Query<Todo[]>: a Resource, reads the cache, no copy
const todo = getTodo(() => (id.value ? { id: id.value } : skip))   // tracked input; `skip` = no query
{(todos.value ?? []).map(t => <li key={t.id}>{t.title}</li>)}
<button onClick={() => addTodo({ title: draft.value })} disabled={addTodo.pending.value}>Add</button>

// route load, handlers, server code, tests (no owner): a promise through the same cache
export const load = async ({ ctx }: LoadArgs) => ({ first: (await listTodos.fetch())[0] })
```

| Call | Where | Returns |
|---|---|---|
| `q(input?)` / `q(() => input \| skip)` | under an owner: component, `derived`, defineState setup | `Query<T>`: `value`, `pending`, `error`, `refresh()`; Boundaries see it |
| `q.fetch(input?)` | anywhere: `load`, handlers, other server functions, tests | `Promise<T>` through the request cache (server) or the client cache |
| `m(input)` | handlers, actions, other server functions | `Promise<T>`; `m.pending` and `m.error` are `Derived` |
| `redirect(href, status?)` | `load`, `run` (return or throw) | never returns normally; 307 by default |
| `invalidate(...tags)` | server code (a `run`), or the client | server: bumps the tags for this response and the shared cache; client: refetches readers |
| `cache.update(q, input, recipe)` / `cache.set` / `cache.get` / `cache.isOptimistic(v)` | `optimistic`, client code | overlay layer (in `optimistic`), base write (elsewhere) |
| `skip` | tracked input | the typed "no query" sentinel (replaces `enabled: false`) |

**Why `q()` and `q.fetch()` are two calls, not one context-sensitive one.** The resource needs an owner (its
binding is cleaned up with the component); a promise doesn't. One call that returned either would have one type
that lies half the time, and research 14 §3.1 wants `state(await q())` to fail to type-check in client code. A
resource call without an owner is **Q001**, with `q.fetch()` as the fix.

**`tags` is top level, not inside `cache`.** PLAN §4's first sketch put `tags` in `cache: { life, tags }`. Tags are
needed whether or not a query is cached across requests: the client cache and the request cache invalidate by them
too. So `tags` (array or `(input) => string[]`) is its own key, and `cache: { life }` only turns on the shared
server cache. PLAN §4's example is updated.

**Context.** `run` and `load` get `ctx`: `{ request, response: { headers }, ...app }`. The app part comes from
`src/context.server.ts` (`export default async ({ request }) => ({ db, user })`), typed by augmenting
`interface Context` in `@weft-js/start`. That's the plug for Drizzle (`ctx.db`) and Better Auth (`ctx.user`, cookies
through `ctx.response.headers`). A cached (shared) query's `ctx.request` throws **Q006** on any read: a value cached
for everyone must not depend on one user's cookies. (PLAN §4 asked for a type error; the runtime check comes first,
and `scope: 'user'` comes with auth.)

## 2. The transform: server modules become stubs

Files under `src/server/**` and named `*.server.ts(x)` are **server modules**. The `weft:start` Vite plugin:

- **Both sides** give each `query({…})`/`mutation({…})` export an id, inserted as `$id: '<name>.<hash6 of the file>'`
  (readable in logs and `weft browser`, stable across builds, no paths leaked).
- **Client:** the module is replaced by stubs. In each definition, `input`, `run`, `cache`, `tags` and
  `invalidates` are removed and `optimistic` is kept. Every other top-level statement goes unless a kept
  `optimistic` references it (an import, or a helper declared in the file); imports nothing references are dropped.
  So a server module's database client, secrets and other exports never reach the browser. The build test checks
  the client JS for a marker string from the fixture's db module, as research 25 does for loaders.
- **Server:** `virtual:weft/fns` imports every server module, so `/_weft/fn/<id>` can answer before any page
  imported the function. Ids register as the modules load.
- `query`/`mutation` imported from `@weft-js/start` in a file that isn't a server module is **Q003** (the plugin errors
  at transform time: its `run` and imports would ship to the client).

Without the plugin (unit tests under plain vitest) definitions keep their `run`, ids come from the export order
(`q1`, `q2`…, or an explicit `$id`), and the fake transport (§7) calls them in process.

## 3. The wire

| Request | Answer |
|---|---|
| `GET /_weft/fn/<id>?i=<json input>` (queries) | `200 { v, t }` value and tags · `400 { e }` Q002 issues · `404` Q009 · `500 { e }` · `{ r }` redirect |
| `POST /_weft/fn/<id>` `{ i, f: [[id, input]…] }` (mutations) | `{ v, t: invalidated, c: [[key, value, tags]…] }`: the result, the tags, the refreshed queries (single-flight) |

- **Mutations are POST only** and need `content-type: application/json` plus an `x-weft: 1` header, and an
  `Origin` (or `Sec-Fetch-Site`) that matches the host when present. A cross-site form or `fetch` can't set the
  header without a CORS preflight, which the server never grants. Failing that is **Q010** (403). A mutation called
  while the server handles a GET (a `load`, a page render, a query's `run`) is **Q004**: GET handlers must be
  side-effect free.
- **Single-flight.** `f` lists the queries the client is currently reading (entries with readers). After `run`, the
  server computes the invalidated tags (`invalidates`, plus any `invalidate()` calls), re-runs the listed queries
  whose tags intersect them, and returns them in `c`. One round trip: the list on screen updates with the mutation's
  response.
- **Redirects.** `redirect()` in `load` (returned or thrown) answers a page request with 307 and `location`, and
  `/_weft/data` with `{ r }`. In a `run` it answers `{ r }`; the client router navigates there (a query's redirect
  replaces the history entry). `redirect()` reached after the page's first byte (a component's query while the page
  streams) can't change the status any more: **Q007**, the Boundary shows the error, and the fix is to call the query
  in `load`. The client follows at most 5 redirects per navigation (then a full load).
- **Serialization** is JSON. In dev the server checks each value it sends and warns **Q005** for what JSON changes
  (`Date`, `Map`, `Set`, class instances, `undefined` in arrays, functions, `NaN`): the client would see a different
  value than the server rendered with. Codecs come with `.weft/contract.json` (next slice).

## 4. Three caches, one invalidation model

```
              tags ──────────────────────────────────────────────────────────┐
client cache  key → { base, layers[], tags, readers, promise }  (one per tab)   │ mutation response: t, c
request cache key → promise, plus every entry it resolved (one per request) ─── │ page payload: #weft-cache
shared cache  key → { value, tags, versions, expires }  (cache: { life }) ──────┘ invalidate = bump tag versions
```

- **Key:** `<id>:<stable JSON of the input>` (sorted object keys), the same on both sides.
- **Request cache (server).** Every `q.fetch()` and every `q()` in the request (loaders, every render pass of a
  streamed page, the mutation's refreshes) goes through one map, found through `AsyncLocalStorage`: a query runs at
  most once per request. `load` awaiting `listTodos.fetch()` and the page's `listTodos()` share one run.
- **Shared cache (server).** Only for `cache: { life }`. `life` is `'seconds'` (1 s), `'minutes'` (60 s),
  `'hours'`, `'days'`, `'max'` or a number of seconds. Stored with the versions of its tags when it was computed; a
  read is a hit iff every tag's version still matches (research 02 §4: O(tags), no index scan). `invalidate()` and
  a mutation's tags bump versions. The store is an interface (`get`/`set`/`versions`/`bump`), memory by default;
  Nitro storage (fs, KV, Redis) plugs in there. No stale-while-revalidate yet.
- **Client cache.** One entry per key. `entry.value` is a `derived`: the base with each pending optimistic layer
  applied in order. A query resource's fetcher reads `entry.value`, so a new base or a layer updates every reader
  in place, with no fetch and no re-render: the resource settles synchronously to the new value and the bindings
  that read it re-run. Concurrent readers of one key share one request.
- **Structural sharing.** A new base is merged into the old one (`share(prev, next)`, TanStack's
  `replaceEqualDeep`): subtrees that are deep-equal keep their old identity. So a refetch that changed one todo gives
  the keyed list the same objects for the other rows, and toggling one todo is one attribute write, not a list rebuild
  (measured in §8).

**SSR transfer (0-miss/0-write).** The request cache's resolved entries go out as `<script type="application/json"
id="weft-cache">` after the stream (like `#weft-data`), and `start()` seeds the client cache before hydrating. The
query resource uses `resource(fetcher, { data: false })`, a new option: the value isn't written into the page's
`#weft-data` (it would travel twice and arrive as a second copy with different identity) and isn't read back from
it; the fetcher returns the seeded value synchronously during hydration, so the resource settles at creation and
hydration writes nothing. The client cache seeds itself from `#weft-cache` when its module loads (the first route
chunk that uses a query, before hydration), so `start()` doesn't import it and an app without queries doesn't ship
it. `/_weft/data` (client navigation) carries the entries its loaders resolved in `c`, handed over through the
router's `client.seed`, so a page's components find their data seeded too.

**Route data follows invalidation.** Each match carries `t`, the tags of the queries its `load` read. When a
mutation invalidates a tag a current level read, the client router refetches `/_weft/data` for the current path and
applies it in place (`applyMatches` writes only what changed; no history entry, no scroll).

## 5. Optimistic overlays

As research 14 §3.3, built:

- Calling a mutation with `optimistic` runs it with a `cache` whose `update(q, input, recipe)` pushes a layer
  `{ m: callId, apply: recipe }` onto that entry. `recipe` gets a **copy-on-write draft** (`produce`, a 60-line
  Proxy): only the objects it writes are copied, so untouched rows keep their identity. The copies are remembered
  for `cache.isOptimistic(row)` (render a pending row dimmed). A recipe may also return a new value.
- **Rebase:** a fresh base (a refetch that was in flight, another mutation's refresh) recomputes `base → layers`,
  so a stale response can't clobber a pending prediction.
- **Success:** the refreshed entries become the base and the call's layers are dropped in the same synchronous
  write, so the next flush shows the server's value with no flicker.
- **Failure:** only this call's layers go; a concurrent call's survive. Then `m.error` is set and the promise
  rejects.
- **S011** (dev, at settle): a layer sat on an entry the mutation's invalidated tags didn't cover. Instead of
  flashing back to the old value, the layer is kept until that entry's next base lands (a refetch the client starts
  at once), and the warning names the query and the tag to add.

## 6. Diagnostics: Q001–Q010 and S011

`Q` is unused in the catalog (W, T, P, H, M, D, X are taken; research 14 owns S). `start`: reported by
`@weft-js/start` while serving or running (throws carry `code`); `start` codes print in the server log as `[weft] Q…`.

| Code | Severity | Catches | Fix |
|---|---|---|---|
| **Q001** | error | `q()` (the resource form) called with no owner: in `load`, a handler, a timer, module scope | `await q.fetch(input)` there; `q()` in components and scopes |
| **Q002** | error | The input failed the query's or mutation's schema (400, with the issues) | Pass what the schema accepts; the issues name the path |
| **Q003** | error | `query`/`mutation` defined outside a server module: its `run` and imports would ship to the client | Move it to `src/server/**` or a `*.server.ts` file |
| **Q004** | error | A mutation called while the server handles a GET (`load`, a page render, a query's `run`) | Call it from a handler or another mutation; reads go in queries |
| **Q005** | warning | A server function's input or result doesn't survive JSON (`Date`, `Map`, `Set`, class, `undefined` in an array, function) | Send plain data (ISO strings, arrays, objects) |
| **Q006** | error | A cached (`cache: { life }`) query reads `ctx.request` (cookies, headers): its value is shared by every user | Drop `cache`, or take the value as input |
| **Q007** | error | `redirect()` after the response started (a component's query on a streaming page) | Call the query in `load`, which runs before the first byte |
| **Q008** | warning | A mutation `invalidates` a tag no query declares (static tags only; `todo:*` matches `todo:${id}`) | Fix the tag name, or add it to the query |
| **Q009** | error | `/_weft/fn/<id>` names no function (the page is older than the server, or the module isn't a server module) | Reload; keep `query`/`mutation` exports in server modules |
| **Q010** | error | A mutation request without the CSRF proof (POST + JSON + `x-weft`, same origin) | Call mutations through their stub, not a hand-made `fetch` or form |
| **S011** | warning | `optimistic` updated a query its mutation's invalidated tags didn't cover (research 14 §3.3) | Add the query's tag to `invalidates` |

## 7. Testing without a server: the fake transport in `@weft-js/core/test`

`@weft-js/core/test` importing sets a marker (`Symbol.for('weft.net')`) that the `@weft-js/start` client runtime checks: with
it, calls go **in process** to the same executor the server uses (input validation, the request cache, tags,
single-flight, JSON round trip), so a component test covers the client cache, overlays, rollbacks and invalidation
with no HTTP and no Vite plugin. `net` grows:

```ts
import { net, render, flush } from '@weft-js/core/test'
net.context({ db: fakeDb, user: { id: 'u1' } })     // the ctx the functions see
net.latency(50)                                      // every call waits 50 ms (with fake timers, clock.tick)
net.fail(addTodo, new Error('nope'))                 // the next call rejects (optimistic rollback)
net.handle(listTodos, () => [{ id: '1', title: 'x', done: false }])   // replace a function's run
net.calls()                                          // [{ id: 'addTodo.…', input, kind: 'mutation' }…]
await net.settle()                                   // wait until no call is in flight, then flush
await net.offline()                                  // calls reject with an OfflineError until net.online()
```

Every test starts with a fresh client cache, no latency, no handlers and no failures. Inside an in-process call the
fake request's scope is current (@weft-js/core/test's `AsyncLocalStorage`), so a `run` that calls another function makes a
server call, as on a real server (that's how Q004 shows up in a unit test). Server diagnostics (Q005, Q007) print as
`console.warn`.

## 8. Built: what was measured

**DOM work** (jsdom under `@weft-js/core/test`, and Chrome on the fixture's `/todos` under `weft dev`):

| Interaction | Writes |
|---|---|
| Hydrating a page whose list comes from `listTodos()` | **0 key misses, 0 DOM writes, 0 requests** (the cache starts from `#weft-cache`) |
| Optimistic toggle of one todo, through the server's answer | **1** (`li.class`): the prediction; the refreshed list changes nothing more |
| Optimistic add | the new row at once; the three existing `<li>` are the same elements afterwards |
| A failing add | the row appears, then goes; the list ends as it began |

`load` awaiting `listTodos.fetch()` (for `meta`) and the component's `listTodos()` run the query **once** per
request. The toggle sends one POST; the list arrives in its response, and the route data (the `Todos (n)` title,
whose `load` read the `todos` tag) is refetched once.

**Sizes** (Vite 8, minified, production `DEV`, brotli):

| What | brotli |
|---|---|
| `start()` (router, levels, `Link`, navigation, `setHead`) | 4.43 KB |
| `start()` + `query`/`mutation` and the client cache (with `resource`) | 8.36 KB |
| **The data runtime, the difference** | **3.93 KB**, only in apps that use a query |
| `exec` chunk (the executor, for @weft-js/core/test's in-process transport) | 2.27 KB, emitted, never loaded by a browser |

**Tests:**

| Package | File | What |
|---|---|---|
| weft | `test/async.test.tsx` | `resource(…, { data: false })`: nothing in the page data, a synchronous read hydrates with 0 writes |
| start | `test/data.test.tsx` | Under the fake transport: dedupe, optimistic toggle in ≤ 1 DOM write, rollback of one call among two, stacked layers, pushed rows and `isOptimistic`, tracked input and `skip`, S011 without flash-back, `net.handle`/`net.offline`, `fetch` outside components, the shared cache, Q001/Q002/Q004/Q005/Q006/Q008, `redirect()` in a run, `share`/`produce` identity |
| start | `test/fn.test.mjs` | `/_weft/fn` over HTTP: `{ v, t }`, Q002 400, Q009 404, Q010 403 (no header, cross origin, GET), single-flight `c`, the shared cache across requests, Q006, `redirect()` in `load` (307, `{ r }`) and in a run (`{ r }` + `set-cookie`), one run per request, `#weft-cache`, route tags, navigation `c`, client stubs with no `run` or server imports |
| start | `test/data.browser.test.mjs` | Chrome: 0/0 hydration with no request, the 1-write toggle before the response, optimistic add with `pending`, the title following invalidation, rollback, a redirecting route via client navigation (one history entry) |
| start | `test/inspect.test.mjs` | `weft routes --meta` shows `/old` as `status: 307, redirect: '/todos'` with no tags or card; `/todos` loads through the app's context |

The build test (`test/build.test.mjs`) still checks the client JS for the fixture db's marker string; the fixture's
server module imports that db, so the stubs are covered there too.

## 9. Where the next slice plugs in

- **Drizzle:** `ctx.db` from `src/context.server.ts`. The dev check that compares declared `tags` with the tables a
  function touched (PLAN §4) wraps `ctx.db`. `schemas.todos.insert` is a Standard Schema, so it goes straight into
  `input`.
- **Better Auth:** `ctx.user` (typed nullable) from the same context function; its cookies go out through
  `ctx.response.headers`, which the handler merges into page, data and function responses. `redirect('/login')` in a
  layout's `load` is the route guard. `cache: { scope: 'user' }` folds `ctx.user.id` into the key.
- **`create-weft --db --auth`** writes `src/context.server.ts`, `src/server/*.ts` and the routes.
- **`.weft/contract.json`:** the transform already knows every id, kind, input schema and tags.
- **CI matrix:** nothing here is Node-specific except `AsyncLocalStorage`, which Bun, Deno and Workers (with
  `nodejs_compat`) provide.

## 10. Gaps (next)

- **`defineState` SSR state payload and `cookie` persist: not built.** They don't fall out of this slice:
  `renderToStream` makes a fresh app per render pass, so the payload needs the last pass's instantiated scopes
  serialized after the stream (research 14 §2.9), and the cookie backend needs `@weft-js/core/persist` to read request cookies
  on the server (through `ctx.request`) and write them through `ctx.response.headers`. Both are the next state slice,
  with S013.
- **The next slice, built:** Drizzle, Better Auth, `create-weft --db --auth --runtime`, `.weft/contract.json` and the
  Node/Bun/Deno e2e matrix are in [28](28-db-auth-runtimes.md).
- **`<Form of={mutation}>`** (works without JS: a plain POST that the server answers with a redirect) isn't built;
  without it, the CSRF check only admits the stubs.
- **Route data after a mutation is a second request** (`/_weft/data`). The mutation's response could carry it.
- **Shared cache:** no stale-while-revalidate, no Nitro storage driver yet (the `Store` interface is the plug), no
  per-user scope.
- **Client cache:** entries are never evicted (no `keep`), no `.live`, no `query.batch`, no retry or offline queue
  (research 14 §3.5).
- **Static checks:** Q003 is a transform error, not yet in `weft check`; Q006 is a runtime check (PLAN §4 asked for a
  type error); S001, S002, S012 and S013 are still research 14's.
- **Compiler (not fixed here):** a lowercase `onclick={…}` isn't treated as an event: SSR writes the function's source
  as an attribute and the client binds nothing. weft's spelling is `onClick`; the lowercase one deserves a W-code.
