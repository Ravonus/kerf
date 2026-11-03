# 28. Drizzle, Better Auth, the contract and three runtimes: `@weft-js/start` (Phase 3, third slice)

Status: **built 2026-10-30; §9 records what was built and measured.** Inputs: PLAN §4, §4.1,
research 02 §3 (T3 patterns), 06 (runtimes), 25 §6 (Nitro), 27 §9 (where this slice plugs in). Spike:
`drizzle-orm@0.45.4`, `better-auth@1.7.14`, Node 22.22, Bun 1.3.14, Deno 2.9.8.

## 1. What the spike settled

**One SQLite path, no native binary.** PLAN §4.1 expected a different driver per runtime. Measured:

| Runtime | Built-in SQLite | Notes |
|---|---|---|
| Node ≥ 22.15 | `node:sqlite` | no flag; prints an ExperimentalWarning |
| Deno 2.9 | `node:sqlite` | same API, `setReturnArrays` included |
| Bun 1.3 | `bun:sqlite` | no `node:sqlite` at all |

All three give `prepare(sql)`, positional parameters and array rows, so the two classes fit behind 10 lines. Drizzle's
`sqlite-proxy` driver takes exactly that (`(sql, params, method) => { rows }`), and a sign-up, session read, sign-in
and transaction through Better Auth's Drizzle adapter passed unchanged on all three. Consequences:

- No better-sqlite3: nothing to compile, nothing for Nitro to trace, and PLAN §4.3's "no native binary is ever
  required for a default app" holds for the database too.
- **The proxy is async, so SQLite and Postgres read alike:** every query is `await`ed, and an agent's code doesn't
  change shape between `--db sqlite` and `--db postgres`.
- One Bun/Node fork stays, at open: `await import('bun:sqlite')` or `'node:sqlite'`, chosen at run time. The same
  build output runs anywhere the preset allows.

**A single connection needs a transaction gate.** The driver is one synchronous connection, but a Drizzle
transaction's body is async. Two requests interleaving would nest `begin`, and a rollback would take another request's
writes with it. So a transaction holds a gate: statements outside it wait, and statements inside it (found through
`AsyncLocalStorage`) pass. Postgres has a pool and doesn't need it.

## 2. The db layer

```ts
// src/db/schema.ts: plain Drizzle tables, safe to import anywhere
export const todos = sqliteTable('todos', { id: text().primaryKey(), userId: text('user_id').notNull(), title: text().notNull(), done: integer({ mode: 'boolean' }).notNull().default(false) })

// src/db/index.server.ts
import { createDb } from '@weft-js/start/db/sqlite'     // or '@weft-js/start/db/postgres'
export const db = createDb({ schema, url: env.DATABASE_URL })

// src/context.server.ts: the plug from research 27 §1
export default async ({ request }) => ({ db, ...(await session(auth, request)) })

// src/server/todos.ts
const input = schemasOf(schema).todos.insert.pick({ title: true })     // the same table is the validator
export const addTodo = mutation({ input, auth: 'user', invalidates: ['todos'], run: ({ input, ctx }) => ctx.db.insert(todos).values({ ...input, userId: ctx.user.id, id: crypto.randomUUID() }) })
```

- **Two entries, not one `createDb` that switches on the URL.** Drizzle's SQLite and Postgres types differ, and a
  bundle should only hold the driver it uses. A URL of the wrong kind is **Q013**.
- **The connection opens on the first statement.** `weft build` loads every server module (the contract, §6), and
  loading one must not touch a database.
- **`schemasOf(schema)`** is `drizzle-zod` per table: `{ select, insert, update }`. They're Zod 4, so Standard
  Schemas, so they go straight into `input` (and the contract). `@weft-js/start/db` carries it; the drivers don't.
- **Client safety.** `src/db/schema.ts` has no connection, so a type or a client-side schema can come from it. Any
  import of `@weft-js/start/db*` or `@weft-js/start/auth` that reaches the client graph is **Q012** at build. Server modules
  and `load` are already stripped (research 25, 27), so Q012 only fires on a real leak.

**Migrations are drizzle-kit's files, applied by weft.** `weft db generate` runs `drizzle-kit generate` (on Node, like
all of dev) into `drizzle/`. The plugin embeds those SQL files in the server bundle (`virtual:weft/migrations`; a
bundle can't read a folder on every preset), and the first request applies what's new, recorded in
`__weft_migrations`; Postgres takes an advisory lock so instances can't race. `createDb({ migrate: false })` opts out.
Two failure modes get codes: a table that doesn't exist (`no such table`, `42P01`) rethrows as **Q014** with the fix,
and `weft check` compares the schema's hash with the one `weft db generate` recorded (**Q015**).

**The touched-tables check (PLAN §4).** The driver sees each statement, so in dev it records the tables a function
reads and writes, in that function's own frame (`AsyncLocalStorage`, so parallel `fetch`es don't mix). After `run`:
a query that read a table no tag names, or a mutation that wrote one no invalidated tag names, is **Q011** (a tag
matches a table by name or as `table:*`). It's a warning, per PLAN: tags stay explicit. Better Auth's tables are
exempt, since `createAuth` owns them.

## 3. Auth

```ts
// src/auth.server.ts: found by the plugin, its handler mounted at /api/auth/*
export default createAuth({ db, schema, secret: env.BETTER_AUTH_SECRET })

// src/server/session.ts
export const signIn = mutation({
  input: z.object({ email: z.email(), password: z.string().min(8) }),
  run: async ({ input, ctx }) => {
    await forward(ctx, auth.api.signInEmail({ body: input, headers: ctx.request.headers, asResponse: true }))
    redirect('/todos')
  },
})

// src/routes/todos/_layout.tsx: a guard is `redirect()` in a layout's load
export const load = ({ ctx }: LoadArgs) => ctx.user ?? redirect('/login')
```

- **`createAuth`** is `betterAuth()` with the Drizzle adapter wired from `db`, email + password on, telemetry off, and
  the owned tables exempted from Q011. Everything else passes through. `better-auth` stays the app's dependency.
- **`session(auth, request)`** gives `{ user, session }`. With no session cookie it answers `null` without touching
  the database, so anonymous pages (and the build's prerender) stay free.
- **Sign-in and sign-out are mutations, not `better-auth/client`.** The stubs are already there, weft's CSRF check
  and redirects apply, and the client pays nothing: nanostores and better-fetch never ship. `forward(ctx, res)` copies
  `set-cookie` to the response and turns a failure into `FnError`.
- **The session changing drops the client cache.** A query cached for one user must not be read by the next person on
  that tab. A redirect answered together with `set-cookie` is a **full load** (`{ r, x: 1 }`), which throws the whole
  client cache away. A mutation that changes the session cookie without a redirect is **A004**.
- **`auth: 'user'` on a query or mutation** makes it refuse with **A002** (401) when `ctx.user` is empty, narrows
  `ctx.user` to non-null in `run`, and is the contract's auth scope. If `ctx` has no `user` key at all, the context
  file never called `session()`: **A003**.
- **Guards run before children.** router-core starts nested loaders in parallel, so a page's `load` could run (and
  fail, or do work) for a visitor its layout is about to redirect. Loaders now run parent first: if one redirects, its
  children don't run. That costs a waterfall for nested `load`s, and a guard that doesn't guard isn't worth the
  saving.
- **`cache: { scope: 'user' }`** (research 27 §9) folds `ctx.user.id` into the shared cache's key and lifts Q006 for
  `ctx.user` only; `ctx.request` stays forbidden.
- **A001:** no secret, or one under 32 characters, on a production server, checked on the first request. The build's
  prerender is exempt, since a build holds no secrets.

## 4. `.weft/contract.json`

`weft build` loads every server module and writes one entry per function: `id`, `name`, `kind`, `input`, `output`
(JSON Schema, draft 2020-12), `tags`/`invalidates` (static ones; `tags` from a function are `"dynamic"`), `cache`,
`auth`, and `errors` (the codes it can answer). A schema that can't become JSON Schema is `{}` plus **C001**.

`output` is a new optional key on both definitions. In dev and tests the value is checked against it, per PLAN §4.2;
a mismatch is **C002**.

## 5. Runtimes

- `weft.config.ts` gets `runtime: 'node' | 'bun' | 'deno'`, and `weft build` turns it into the Nitro preset (`node`,
  `bun`, `deno_server`); `--runtime` overrides it. `create-weft --runtime` writes it plus the `start` script.
- Dev stays on Node (PLAN §4.1). So the matrix is the check that matters: **`packages/start/scripts/runtime-matrix.mjs`
  builds one app per runtime, serves each on its own runtime with its own database, and runs one e2e file against
  each.** `.github/workflows/runtime-matrix.yml` runs it, but the repo has no CI yet, so the local script is the gate.
- `weft dev` loads `.env` (`process.loadEnvFile`). Production takes the host's environment.

## 6. `create-weft`

`--db sqlite|postgres|none` (default `none`), `--auth` (needs a db, otherwise a usage error) and `--runtime`. With a
db the scaffold has a todo app, with `--auth` a sign-in/sign-up flow and a guarded `/todos`. It writes `.env` with a
freshly generated secret and a gitignored `.data/`. `weft db generate` is one step after install; before it, the page
answers Q014 with that fix.

## 7. Diagnostics

`Q` continues; `A` (auth) and `C` (contract) are new letters, unused in the catalog and PLAN.

| Code | Severity | Catches | Fix |
|---|---|---|---|
| Q011 | warning | A function touched a table its `tags`/`invalidates` don't name | Add the tag |
| Q012 | error | `@weft-js/start/db*` or `@weft-js/start/auth` reached the client graph | Import it from a server module |
| Q013 | error | A database URL the driver can't open, or a driver missing on this runtime | Use the matching entry, or install the driver |
| Q014 | error | A table doesn't exist: migrations weren't generated or applied | `weft db generate` |
| Q015 | warning | The schema changed since the last `weft db generate` | `weft db generate` |
| A001 | error | The auth secret is missing or short in production | Set `BETTER_AUTH_SECRET` (32+ characters) |
| A002 | error | An `auth: 'user'` function was called with no session (401) | Sign in first, or guard the route |
| A003 | error | `auth: 'user'`, but `ctx` has no `user` | Spread `session(auth, request)` in `src/context.server.ts` |
| A004 | warning | A mutation changed the session cookie without a redirect: the tab keeps the last session's data | `redirect()` after it |
| C001 | warning | A schema that can't become JSON Schema | Use a schema with JSON Schema support |
| C002 | error | A function's value failed its `output` schema (dev, tests) | Fix `run` or the schema |

## 8. Exit check

`evals/phase3-exit.mjs`: scaffold with `create-weft --db sqlite --auth`, install, hand a fresh agent the app and one
feature request (todo sharing), with no access to the framework's source beyond what an app has, then run the e2e file
on Node, Bun and Deno. The e2e spec is the agent's acceptance test, not its guide. Result in
`evals/results/phase3-exit.md`.

## 9. Built

Built as designed, in `@weft-js/start` (`./db`, `./db/sqlite`, `./db/postgres`, `./auth`, `./contract`), `create-weft` and
`@weft-js/cli`. Measured 2026-10-30 on Node 22.22, Bun 1.3.14, Deno 2.9.8 and Postgres 16.13.

**Exit check: passed** ([result](../../evals/results/phase3-exit.md),
[findings](../../evals/results/phase3-exit-FINDINGS.md)). The scaffold plus an agent's todo sharing passes 24 hidden e2e
checks on all three runtimes. The scaffold passes 15 on SQLite and on Postgres, on all three.

**Size.** The fixture's loaded client JS grows 43 B br (entry +4, route +23, async +16), and none of Drizzle or Better
Auth ships. The client bundle total went from 17,326 to 18,100 B br, but +736 of that is the `exec` chunk, which the
browser never loads. Hydration stays 0 misses, 0 writes, and the e2e checks no fetch. The scaffold's server is 2.6 MB.

**Added to the design along the way:**

- `weft start` serves the build on the configured runtime (a `node .output/…` script tripped P002 and tied the app to
  Node), and `weft dev`/`weft start` load `.env`.
- `Stream.settle()` in weft's SSR: a resource created outside every Boundary has nowhere to stream to, so the shell
  now waits for it. Without this a query read outside a Boundary refetched on hydration.
- `uid()` in warp-core has separate server and client spaces (`field-s0`, `field-0`). A client id made after hydration
  could equal a server one, and the sign-up form's labels pointed at the wrong input.
- The server stamps the socket's address in a private header, stripped from anything the client sent, so Better Auth's
  rate limit isn't one shared bucket.
- `FnError` also works on the server path: `forward()` needs it to answer a failed sign-in with Better Auth's message.
- `run` is awaited inside the function's frame. A Drizzle query is a lazy thenable, so `run: () => db.select()…`
  otherwise ran outside it and Q011 saw nothing. The Q011 tests caught this.
- In a full-stack app, AGENTS.md drops the diagnostics table's Fix column for the Full stack section, to stay under
  8 KB; `weft check --json` prints each fix.

**Left open.** `weft check` doesn't read server modules, so Q011 only fires in `weft dev`, when the function runs.
Postgres's in-process tests need `WEFT_TEST_POSTGRES` (they skip otherwise), and the matrix on Postgres is a manual run.
`create-weft`'s tests cover the templates; the install, build and serve of a db scaffold is only covered by the matrix.
`.github/workflows/runtime-matrix.yml` has never run.
