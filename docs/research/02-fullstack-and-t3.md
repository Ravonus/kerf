# 02 — Full-stack layer: T3-family stacks, meta-frameworks, typed RPC, caching

Research date: 2026-10-28. Versions come from `npm view` on that date unless a source is cited. Statements marked
**(unverified)** could not be confirmed from a primary source.

**Constraints (from the user):**
- weft is **not React**. It is its own fine-grained reactive runtime (components run once).
- Only **UI-framework-agnostic** pieces are candidate foundations: Vite, Nitro/h3, Hono, Drizzle, Zod, tRPC/oRPC core,
  TanStack Router/Query/DB core.
- Next.js, React Router, SvelteKit and SolidStart are **references** for features such as caching, not bases.
- "t3-code" means **create-t3-app (the T3 Stack) and starters like it**.

---

## TL;DR

1. **"t3-code" means the T3 Stack family.** The patterns worth copying:
   - **create-t3-app:** typesafe env, plus Zod input on every procedure.
   - **create-t3-turbo:** `api` / `auth` / `db` / `ui` package split, plus Better Auth.
   - **Better-T-Stack:** à-la-carte CLI, oRPC or tRPC, Hono, and MCP/skills add-ons.
   - **Wasp:** operations declare the entities they touch, so cache invalidation is automatic.
   - **Epic Stack:** Zod-validated progressive forms, server-side cachified, and ADRs in the repo.

   Do **not** fork create-t3-app. It is a Next.js+React scaffolder and has been nearly dormant since Nov 2025 (7.40.0).
2. **Don't fork a meta-framework.** Compose these agnostic layers:
   - **Vite 8** (Environment API, Rolldown)
   - **Nitro v3** (still beta; h3 v2 underneath is stable 2.0.8)
   - **Drizzle**
   - **Zod 4** via Standard Schema
   - optional **@tanstack/router-core / query-core**
3. **Own three things:**
   - the server-function compiler transform
   - a small **tagged cache** (Nitro has TTL/SWR caching but **no tag invalidation**)
   - the client query cache, with single-flight mutations
4. **One schema → everything:**
   - The Drizzle table is the source of truth.
   - `drizzle-orm/zod` (1.0 RC) or `drizzle-zod` (0.x) derives the Zod schemas.
   - A `query()` / `mutation()` definition takes that schema as `input`. That gives a validated server function, a
     typed client, form validation (Standard Schema) and a cache key `[fnId, input]`.
   - Tags are automatic from the tables the function reads and writes (the Wasp idea, done by instrumenting Drizzle).

---

## 1. "t3-code" = create-t3-app and similar typed full-stack starters

### Disambiguation (one line)

`pingdotgg/t3code` (Theo's GUI for coding agents) is unrelated. It is an Effect-based Node WebSocket server with
Electron, web and React Native clients, MIT licensed, ~31k stars. Per the user it is out of scope.
(https://github.com/pingdotgg/t3code)

### create-t3-app (the T3 Stack)

- **What it is:** a CLI (`npm create t3-app`) that scaffolds a Next.js App Router app. The modules are opt-in:
  - tRPC v11
  - Drizzle or Prisma
  - NextAuth (Auth.js v5)
  - Tailwind
  - Zod for procedure inputs and env (`@t3-oss/env-nextjs`)

  Docs: https://create.t3.gg/en/usage
- **Status:** `create-t3-app@7.40.0` is latest (Next 15, next-auth v5). It was last published 2025-11-05, and the repo's
  last push was 2025-12-13. MIT, ~29k stars. It is effectively in maintenance mode.
  (https://www.greptile.com/grepository/create-t3-app ; npm)
- **Architecture:**
  - single Next.js app
  - `src/server/api/routers/*` holds tRPC routers with `.input(z.object(...))`
  - `src/server/db` holds Drizzle/Prisma
  - `src/env.js` holds the Zod-validated env
  - `src/trpc/react.tsx` provides the client with TanStack Query
- **"Forking it" for weft:** pointless as code, because every file assumes React and Next. Its value is the
  **philosophy**: typesafe, modular, bring only what you need, Zod at every boundary. weft should copy the patterns, not
  the code.

### Similar stacks and what weft should copy

| Stack | Status (Oct 2026) | Shape | Pattern to copy |
|---|---|---|---|
| **create-t3-turbo** | Active (pushed 2026-10-28), MIT, ~6k★ | Turborepo with apps `nextjs`, `tanstack-start`, `expo`. Packages: `api` (tRPC v11), `auth` (Better Auth), `db` (Drizzle), `ui` | The **package split** (`api`/`db`/`auth`/`ui`), **Better Auth** as the default auth, and one API package serving web and mobile. https://github.com/t3-oss/create-t3-turbo |
| **Better-T-Stack** (`create-better-t-stack` 3.49.0) | Very active, MIT, ~5.8k★ | À-la-carte CLI. Frontends: React / TanStack Start / Solid / Svelte / Nuxt / Next / RN. Backends: Hono, Elysia, Express, Fastify, Convex or "self". API: **tRPC or oRPC**. ORM: Drizzle or Prisma. DBs: SQLite / Postgres / MySQL / Mongo. Auth: Better Auth or Clerk. Runtimes: Bun / Node / Workers. Add-ons include **MCP** and **Skills** | **Agent-friendly à-la-carte scaffolding** (flags, not prompts). Hono/oRPC as an agnostic backend option. **Ship MCP + skills** with the starter. https://github.com/AmanVarshney01/create-better-t-stack |
| **TanStack CLI** (`create-tanstack` 0.54, `@tanstack/cli` 0.72) | Active | Scaffolds Start/Router apps with "add-ons" | The add-on model, where each integration is a composable file overlay. |
| **Wasp** 0.26.1 | Active (release 2026-10-23), MIT, ~18.8k★, still 0.x | `main.wasp.ts` spec declares app, routes, auth, `query()` / `action()` with `entities: [...]`, plus jobs. Prisma schema. Compiles to React + Node + Prisma | **The best idea in this family:** operations declare the entities they touch, so **query caches invalidate automatically** after actions. Also: one declarative spec an agent can read. https://wasp.sh/docs |
| **RedwoodSDK** (`rwsdk` 1.7.5) | Active, MIT, ~1.7k★ | Vite plugin. React RSC + server functions. `defineApp` / `route` returning Web `Response`. Cloudflare workerd only. (Old RedwoodJS `@redwoodjs/core` 8.9.0 is legacy) | "Zero magic": routes are plain `Request → Response`, and middleware is plain functions. https://github.com/redwoodjs/sdk |
| **Epic Stack** (Kent C. Dodds) | Active, MIT, ~5.5k★ | React Router 7.16, Prisma 6 + SQLite/LiteFS, **Conform + Zod** forms, **@epic-web/cachified**, Fly.io | **Progressive-enhancement forms validated by the same Zod schema** on client and server. **cachified** (SWR + check-value + forceFresh) as the server cache. **`docs/decisions/` ADRs**, which are great context for agents. https://github.com/epicweb-dev/epic-stack |
| **SolidStart templates** (`npm init solid`) | SolidStart 2.1.0 | with-drizzle / with-auth / with-trpc style templates **(exact list unverified)** | The closest *reactivity model* to weft. Copy `query()` + `action()` + keyed revalidation (see §2). |

**What weft's built-in stack should take from this family:**

1. **Zod-validated env** (`@t3-oss/env-core` 0.13.11 is framework-agnostic and supports Zod 4 / Standard Schema). Use it
   directly or replicate it as `weft/env`.
2. **Every server boundary takes a Standard Schema `input`** (T3/tRPC convention).
3. **Monorepo-ready layout** (`app/`, `server/`, `db/`, `auth/`), but a single package by default.
4. **Better Auth** as the default auth. It is framework-agnostic and uses the Drizzle adapter.
5. **Wasp-style automatic invalidation** from entity read/write sets.
6. **Epic-style forms:** one schema gives client preflight, server validation and field errors, and the form works
   without JS.
7. **Flag-driven, non-interactive CLI that also writes `AGENTS.md`, skills and an MCP config** (Better-T-Stack).
8. **ADRs in `docs/decisions`** (Epic).

---

## 2. Meta-framework landscape (references vs agnostic building blocks)

| Project | Version / status (Oct 2026) | Relevance to weft |
|---|---|---|
| **Vite 8** | 8.3.5. Stable since 2026-03-12. Rolldown replaces esbuild+Rollup. The Environment API is what every framework below uses for client/ssr/server builds | **Foundation.** https://vite.dev/blog/announcing-vite8 |
| **Nitro v3** (`nitro`) | `3.0.260903-beta`. Public beta 2026-03-11, alpha since 2025-10-11, **no stable yet**. `nitropack` → `nitro`. Built on **h3 v2** (stable 2.0.8) and srvx. `nitro()` Vite plugin. Rolldown. Deploy presets: Node, Bun, Deno, Workers, Vercel, Netlify, Lambda. Used by TanStack Start, Nuxt 5, T3Chat | **Foundation (server + deploy).** Pin the version. The fallback if beta pain hurts: h3 v2 + srvx directly. https://nitro.build/blog/v3-beta |
| **Hono** | 4.13.14 (v5 RC) | Agnostic router. Can be Nitro's `server.ts` entry. Good for a plain HTTP/API surface but redundant with h3 if using Nitro |
| **TanStack Start** | **1.0 stable 2026-10-13** (`@tanstack/*-start` 1.169.x). Needs Vite ≥8 (or Rsbuild 2). `createServerFn().validator(schema).handler()` (RC's `.inputValidator()` was renamed to `.validator()`). Full-stack middleware. Selective SSR. Adapters dropped in favor of Nitro. React, **Solid** and **Vue** bindings exist on shared agnostic cores (`start-plugin-core`, `start-server-core`, `start-client-core`, `router-core`). **No server-side cache/tag API**: caching is TanStack Query + HTTP headers | **Most important reference.** Its cores are the one realistic "build on" option: a `weft-start` binding written like `@tanstack/solid-start`. https://tanstack.com/blog/tanstack-start-1-0 · https://appwrite.io/blog/post/tanstack-start-stable-appwrite-sites |
| **SolidStart 2** (`@solidjs/start`) | 2.0.0 on 2026-08-04, 2.1.0 on 2026-10-22. **Vinxi removed**. Uses the Vite Environment API, works with the Nitro v3, Cloudflare and Netlify Vite plugins. Router-agnostic (Solid Router or TanStack Solid Router). Built on Solid 1.x. (Solid 2.0 is `2.0.0-rc.19`. TanStack has Solid-2 RC builds.) | **Reference** for `"use server"` + `query(fn, key)` / `action()` / `revalidate(key)` / single-flight mutations, in a fine-grained model like weft's. https://docs.solidjs.com/solid-start/v2 |
| **SvelteKit** | 3.1.0 (3.0.0 on 2026-10-01). **Remote functions** (`query`, `query.batch`, `query.live`, `form`, `command`, `prerender`) take a Standard Schema as the first argument. Forms return per-field `issues()`, with an optional client `preflight` schema. **Single-flight mutations** (a form/command refreshes queries server-side and returns data in the same response). Still flagged `experimental.remoteFunctions` in the docs | **Best API reference** for "server function + schema + form + refresh". Copy it nearly 1:1. https://svelte.dev/docs/kit/remote-functions |
| **Next.js 16** | 16.4.3. `"use cache"` became stable in 16.0 behind `cacheComponents: true`. Cache key = build ID + function ID + serialized args (+ captured closure vars). `cacheLife(profile)` with stale/revalidate/expire (default 5m/15m/∞). `cacheTag()`. `revalidateTag()` (background SWR) vs `updateTag()` (read-your-writes in actions). `use cache: remote` (cache handler, e.g. Redis) and `use cache: private`. Pluggable `cacheHandlers`. PPR = static shell + dynamic holes from Cache Components | **Reference for the caching vocabulary only.** Copy profiles + tags + the update/revalidate split. https://nextjs.org/docs/app/api-reference/directives/use-cache |
| **React Router v8** | 8.5.1 (v8.0 on 2026-06-17). Middleware on by default. RSC still unstable | Reference (loaders/actions, middleware). Not a base. https://remix.run/blog/react-router-v8 |
| **Remix 3** | **3.0.0 stable 2026-10-01**, 3.1.0 on 2026-10-23. **Dropped React**: its own `@remix-run/component` model. Fetch-API, runtime-agnostic. Ships many small packages (`fetch-router`, `route-pattern`, `data-schema`, `data-table`, `session`, `auth`, `file-storage`, …) | **Interesting agnostic parts.** `@remix-run/fetch-router` / `route-pattern` are usable without Remix's UI, but young. Also proof that a non-React full-stack framework is viable in 2026. https://www.infoq.com/news/2025/08/remix-run-v3-drops-react |

### Which to build on rather than reinvent

- **Build on:** Vite 8 (+ Environment API), Nitro v3 (or h3 v2 + srvx), Drizzle, Zod 4, Better Auth.
- **Optional:** `@tanstack/router-core` (typed routes, search-param validation) and `@tanstack/query-core` (client
  cache). Both are framework-agnostic, and Solid and Vue bindings prove the shape.
- **Seriously consider:** implementing weft as a *binding* of TanStack Start's agnostic cores, the way `solid-start` is.
  - **Pros:** server-fn compiler transform, Nitro deploy, middleware, selective SSR and streaming all come free and
    maintained.
  - **Cons:** a big surface, coupling to TanStack's release cadence, no server cache layer (you add it anyway), and the
    `createServerFn().validator().handler()` builder is wordier for agents than a single object literal.
- **Decision rule:** if weft wants file-based routing + typed search params soon, bind TanStack cores. If weft wants the
  smallest owned surface, use Vite + Nitro directly with a weft-owned router (~1–2k LOC). This doc recommends the latter
  for v0, keeping router-core as a drop-in option.
- **Don't build on:** Next.js, React Router, RedwoodSDK (all React/RSC). SolidStart (tied to Solid's runtime).
  SvelteKit (Svelte compiler).

---

## 3. Typed RPC / data

### Options

- **Zod 4** (4.6.7):
  - Implements **Standard Schema v1** (`@standard-schema/spec` 1.1.0).
  - `z.toJSONSchema()` produces OpenAPI/MCP tool schemas for free.
  - `.meta()` / registries carry labels and descriptions, useful for auto-generated forms and agent docs.
  - Codecs handle encode/decode for Dates over the wire.

  Accept **any Standard Schema** at boundaries but document Zod as the default. https://zod.dev/v4 ·
  https://standardschema.dev
- **tRPC v11** (11.19.0): router of procedures, `.input(schema)`. `@trpc/tanstack-react-query` adds
  `queryOptions` / `queryKey` helpers (React-specific). Core client and server are agnostic. Needs a router object and an
  HTTP adapter. https://trpc.io
- **oRPC** (1.16.1 stable, v2 in beta.47):
  - tRPC-like, plus **contract-first** (`@orpc/contract`).
  - **Native OpenAPI** generation.
  - Standard Schema support.
  - `@orpc/tanstack-query` covers React, Vue, **Solid** and Svelte.
  - File/stream support.

  It is the better fit if weft wants public HTTP APIs and OpenAPI/MCP exposure from the same definitions.
  https://orpc.dev · https://github.com/middleapi/orpc
- **Server functions** (TanStack `createServerFn`, SolidStart `"use server"`, SvelteKit remote functions):
  - A compiler replaces the import on the client with a fetch stub carrying a stable function ID.
  - No router object, and the call site *is* the type.
  - Better DX and fewer files, which is exactly what agents want.
  - Downside: endpoint URLs are opaque. Fix: also mount them at stable `/_weft/fn/<id>` paths and emit an
    OpenAPI/MCP manifest.

**Verdict:** weft should expose **server functions as the primary API**, implemented with its own small Vite transform.
They should use **oRPC-compatible semantics** (input schema, output schema, errors, middleware/context), so an
`exportAsOpenAPI()` / MCP adapter is trivial. Don't make users write tRPC routers.

### Caching ↔ typed queries ↔ invalidation

- **TanStack Query** (`query-core` 5.105, v6 in RC): key-based cache. `invalidateQueries({ queryKey })` with prefix
  matching. `setQueryData` for optimistic updates. Agnostic core.
- **TanStack DB** (0.15.2, beta): normalized client collections, live queries, transactional optimistic mutations that
  roll back on failure, and sync modes (eager / on-demand / progressive) with Electric/Query collections. Powerful but
  beta and heavier. Treat it as a **later** opt-in for local-first apps. https://tanstack.com/db/latest/docs/overview
- **The pattern every modern framework converged on** (SolidStart, SvelteKit, Next 16):
  1. Queries have a stable key = `fnId + serialized args`.
  2. Mutations declare/return which keys/tags to refresh.
  3. The server re-runs those queries **in the same response** (single-flight), so the client gets fresh data without a
     waterfall.
  4. Optimistic updates are a local overlay keyed the same way and dropped when the response lands.

### The simplest "define once" model for agents

```ts
// db/schema.ts — Drizzle is the source of truth for storage
export const todos = table('todos', {
  id: id(), title: text().notNull(), done: boolean().default(false), userId: ref(users.id),
})

// server/todos.ts
import { query, mutation, z } from 'weft/server'
import { schemas } from 'weft/db'            // derived: schemas.todos.{select,insert,update}

export const listTodos = query({
  input: z.object({ done: z.boolean().optional() }),
  cache: { life: 'minutes' },               // tags auto = ['todos'] (tables read)
  run: ({ input, ctx }) => ctx.db.select().from(todos).where(...),
})

export const addTodo = mutation({
  input: schemas.todos.insert.pick({ title: true }),   // also the form schema
  run: ({ input, ctx }) => ctx.db.insert(todos).values({ ...input, userId: ctx.user.id }),
  // invalidates auto = ['todos'] (tables written) → listTodos refreshed single-flight
})
```

From that one declaration the agent gets:

- **DB table + migration**: drizzle-kit.
- **Zod schemas**:
  - `createSelectSchema` / `createInsertSchema` / `createUpdateSchema` from `drizzle-orm/zod` on the 1.0 RC
    (`drizzle-orm@rc`, 1.0.0-rc.5)
  - or from `drizzle-zod` ≥0.8.3 on stable `drizzle-orm` 0.45.4. `drizzle-zod` is deprecated in favor of the built-in
    export since 1.0.0-beta.15.

  https://orm.drizzle.team/docs/zod · https://github.com/drizzle-team/drizzle-orm/discussions/5371
- **Validated server function**: input parsed through Standard Schema. Output optionally validated in dev.
- **Typed client**: `listTodos({ done: false })` returns a reactive resource on the client and a direct call on the
  server.
- **Form validation**: `<Form of={addTodo}>` uses the same schema for client preflight, server parse and per-field
  `issues` (the SvelteKit `form` / Epic Conform pattern), and works without JS.
- **Cache key**: `[fnId, stableStringify(input)]`.
- **Tags**: tables read and written, captured by a thin Drizzle wrapper on `ctx.db`, à la Wasp entities. Override with
  `cache: { tags: [...] }` for fine-grained keys like `todos:${id}`.

Schema direction: **Drizzle-first, Zod-derived.** Column types such as numeric, timestamps and enums are richer than
Zod, and drizzle-kit migrations need them. A Zod-first → Drizzle generator is possible but lossy.

---

## 4. Recommended minimal backend for weft

### Build on (don't own)

| Layer | Choice | Why |
|---|---|---|
| Build/dev | **Vite 8** Environment API (`client`, `ssr`, `server`) | Universal, Rolldown-fast. Every peer framework uses it |
| Server runtime + deploy | **Nitro v3** via `nitro/vite` (pin the beta) | Deploy presets, storage (unstorage), `defineCachedFunction` (maxAge / swr / staleMaxAge / getKey / `.invalidate()` / `.expire()`), routeRules `cache` / `swr`, tasks. If the beta bites, drop to **h3 v2 (stable) + srvx** |
| DB | **Drizzle** (+ drizzle-kit). SQLite/libSQL default, Postgres option | TS-first, agnostic, built-in Zod derivation |
| Validation | **Zod 4**, accepted via **Standard Schema** | One schema for input / forms / OpenAPI / MCP |
| Auth | **Better Auth** (Drizzle adapter) | Agnostic, the T3-family default |
| Env | `@t3-oss/env-core` or an equivalent `weft/env` | Fail-fast typed env |
| Optional | `@tanstack/router-core`, `@tanstack/query-core`, oRPC OpenAPI generator | Swap in rather than reinvent if the owned versions grow |

### Own (small, weft-specific)

1. **Server-function transform** (Vite plugin, ~300–600 LOC).
   - `query()` / `mutation()` / `action()` exports in `server/**` or `*.server.ts` become client stubs that POST
     (mutations) or GET (cacheable queries, `?input=` encoded) to `/_weft/fn/:id`.
   - Ids are stable hashes of file path + export name.
   - Use explicit wrapper calls instead of a `"use server"` string directive: easier for agents to read, grep and
     type-check.
2. **Request context + middleware**: `ctx = { db, user, req, cache }`, typed via a `defineContext()`.
3. **Tagged cache** (~200 LOC) on Nitro storage.
   - Store `{value, tags, staleAt, expireAt}` under `fnId:inputHash`.
   - Keep a `tag → keys` index (or tag version counters: a key is valid iff the stored tag versions match current ones,
     which is O(tags) and needs no index scans).
   - Nitro's cache has **no tag invalidation**, which is why this is owned.
4. **Client data runtime**: a keyed resource cache wired to weft signals, Suspense-like streaming holes, single-flight
   mutation responses, an optimistic overlay, and dedupe/batching (SvelteKit `query.batch`).
5. **Router + SSR/streaming renderer** for weft components (out of scope here). Route modules export `load` (a query) +
   `meta`.

### Caching primitives to expose (keep it to five)

```ts
query({ input, run, cache?: { life?: 'seconds'|'minutes'|'hours'|'days'|'max'|{stale,revalidate,expire}, tags?: string[] | ((input)=>string[]), scope?: 'shared'|'user' } })
mutation({ input, run, invalidates?: string[] | ((input, result)=>string[]) })   // default: auto table tags
revalidateTag(tag)   // mark stale → SWR on next read (Next's revalidateTag)
updateTag(tag)       // expire now + re-run affected queries in this response (Next's updateTag / single-flight)
route config: { render: 'static' | 'isr' | 'dynamic', revalidate?: seconds, tags?: [...] }   // ISR via Nitro routeRules + tag hook
```

Rules:

- **`cache` absent → not cached on the server**: per-request dedupe only, like SvelteKit. Explicit beats Next's
  implicit `default`.
- **`scope: 'user'`** folds `ctx.user.id` into the key. This replaces Next's `use cache: private`. Never read cookies
  inside a shared cached scope; make that a type error by giving `run` a context without `req` when `scope: 'shared'`.
- **Same keys and tags on the client.** The server response carries `{tagsInvalidated, refreshed: [{key, value}]}`, and
  the client cache applies them, giving one invalidation model end to end.
- **ISR/static**: Nitro prerender + routeRules `swr`. Tag invalidation purges the page entries whose render read those
  tags. Record each page's tag set during render.
- **Storage driver**: memory in dev, fs/KV/Redis in prod, using Nitro `cache.driver` config.

### Explicitly not doing (v0)

- RSC-style component caching
- PPR
- a GraphQL layer
- local-first sync (TanStack DB later)
- multiple validators in docs
- an adapter zoo (Nitro presets cover it)

---

## Sources

- create-t3-app: https://create.t3.gg/en/usage · https://www.greptile.com/grepository/create-t3-app · https://github.com/t3-oss/create-t3-app
- create-t3-turbo: https://github.com/t3-oss/create-t3-turbo
- Better-T-Stack: https://github.com/AmanVarshney01/create-better-t-stack
- Wasp: https://wasp.sh/docs · https://github.com/wasp-lang/wasp
- RedwoodSDK: https://github.com/redwoodjs/sdk
- Epic Stack: https://github.com/epicweb-dev/epic-stack
- t3code (disambiguation only): https://github.com/pingdotgg/t3code
- TanStack Start 1.0: https://tanstack.com/blog/tanstack-start-1-0 · https://appwrite.io/blog/post/tanstack-start-stable-appwrite-sites · https://www.netlify.com/changelog/2026-10-13-tanstack-start-1-0/
- SolidStart v2: https://docs.solidjs.com/solid-start/v2 · Solid 2 beta: https://www.infoq.com/news/2026/05/solidjs-2-async/
- Nitro v3: https://nitro.build/blog/v3-beta · https://nitro.build/docs/cache
- Vite 8: https://vite.dev/blog/announcing-vite8
- SvelteKit remote functions: https://svelte.dev/docs/kit/remote-functions
- Next.js `use cache`: https://nextjs.org/docs/app/api-reference/directives/use-cache
- React Router v8: https://remix.run/blog/react-router-v8
- Remix 3: https://www.infoq.com/news/2025/08/remix-run-v3-drops-react · https://infoq.com/news/2026/07/remix-3-beta-preview · npm `remix@3.0.0` (2026-10-01)
- oRPC: https://github.com/middleapi/orpc · tRPC: https://trpc.io
- Zod 4 / Standard Schema: https://zod.dev/v4 · https://standardschema.dev
- Drizzle + Zod: https://orm.drizzle.team/docs/zod · https://github.com/drizzle-team/drizzle-orm/discussions/5371
- TanStack DB: https://tanstack.com/db/latest/docs/overview
- Version numbers: `npm view <pkg> dist-tags` / `time`, run 2026-10-28.
