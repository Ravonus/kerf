# Full stack: `@weft-js/start`

Needs one of Node, Bun or Deno, and no Rust (`weft docs rust` is opt-in). An app builds for and runs on all three.

## Files

```
src/routes/**            file routes: _layout.tsx, index.tsx,
                         [id].tsx, [...rest].tsx, 404.tsx,
                         _error.tsx
src/server/**            queries and mutations (client gets stubs);
                         a Rust body: `weft docs rust`
src/db/schema.ts         Drizzle tables; safe to import anywhere
src/db/index.server.ts   the database client
src/auth.server.ts       auth provider (Better Auth by default),
                         mounted at /api/auth/*
src/context.server.ts    what `ctx` holds
```

Any auth provider works: `defineAuth` from `@weft-js/start/auth` takes a `handler(request)` for `/api/auth/*` and a
`session(request)` that returns `{ user, session }`. `ctx.user` and `auth: 'user'` come from those two.

## Routes

<!-- example: skip needs the app's own getList query -->
```tsx
// src/routes/lists/[id].tsx
import type { LoadArgs, Meta, RouteProps } from '@weft-js/start'
import { getList } from '#/server/lists'

export const load = async ({ params }: LoadArgs<'/lists/[id]'>) => ({
  list: await getList.fetch({ id: params.id }),
})
export const meta: Meta<typeof load> = ({ data }) => ({
  title: data.list.name,
})
export default function List(
  props: RouteProps<typeof load, '/lists/[id]'>,
) {
  const { data } = props
  return <h1>{data.list.name}</h1>
}
```

`props.data` and `const { data } = props` stay live; compute from them in JSX or `derived`, not in the component body (W001).

Import your own code as `#/server/todos`, which is `src/server/todos`. That alias is `paths` in `tsconfig.json`: change it or add your own there, and Vite and `weft check` follow. Generated files have their own prefix: `weft:slot/<id>` and `weft:tokens/<name>`.

`load` and `meta` never ship to the client. A layout's `load` runs before its children's, so it's where a guard goes.
A layout's `params` are its page's, a `[...rest]` included, so a layout can mark the page it shows.
Set `meta` on every page as part of building it: a title and one plain sentence from what is on the page. On a param
route build it from `data` and `params`. `weft docs meta` has the rest.
Links are `<Link href>`; code navigates with `navigate(href)`.

Navigation is instant: the URL and `aria-current` change on click, kept layouts stay, and the level that changes shows a
skeleton made from its markup until its data arrives. Never build a loading state for a route change yourself. When the
made one doesn't fit (a page that is one big component, a hero), name a function of plain markup and export it:

```tsx
function HomeSkeleton() {
  return (
    <section data-site="hero">
      <h1>Your headline</h1>
      <p data-skeleton></p>
    </section>
  )
}
export const skeleton = HomeSkeleton
```

It runs before the page's code loads, so only `div span section article main header footer p h1-h6 ul ol li`, string
`class`/`data-*` attributes and text; anything else warns and leaves no skeleton. `export const skeleton = false` keeps
the old page up instead.

Chrome shared by several sections (a sidebar, section tabs) goes in the one layout above them, following the URL with
`currentPath()` from `@weft-js/start`. A `_layout.tsx` per section is replaced, chrome and all, whenever you move
between sections, so the sidebar flashes and is rebuilt. Keep `{props.children}` in the same parent on every page.

## Server functions

```ts
// src/server/todos.ts
import { mutation, query } from '@weft-js/start'
import { schemasOf } from '@weft-js/start/db'
import { eq } from 'drizzle-orm'
import { z } from 'zod'
import * as schema from '#/db/schema'

const { todos } = schema
const schemas = schemasOf(schema, {
  todos: { title: (s: z.ZodString) => s.trim().min(1) },
})

export const listTodos = query({
  tags: ['todos'],                  // what invalidates it
  auth: 'user', // anyone else gets A002; ctx.user is non-null
  run: ({ ctx }) => ctx.db
    .select()
    .from(todos)
    .where(eq(todos.userId, ctx.user.id)),
})

export const addTodo = mutation({
  input: schemas.todos.insert.pick({ title: true }),
  auth: 'user',
  invalidates: ['todos'], // tagged queries return in the response
  optimistic: ({ input }, cache) => {
    return cache.update(listTodos, undefined, l => void l.push({
      id: `tmp:${input.title}`,
      title: input.title,
      done: false,
      userId: '',
      createdAt: 0,
    }))
  },
  run: async ({ input, ctx }) => {
    const [row] = await ctx.db
      .insert(todos)
      .values({
        id: crypto.randomUUID(),
        userId: ctx.user.id,
        createdAt: Date.now(),
        ...input,
      })
      .returning()
    return row
  },
})
```

- `q()` in a component or `defineState` setup: a `Resource`. `(q().value ?? []).map(…)`. `q(() => (id.value ? { id: id.value } : skip))` for a tracked input. Created inside a `<Boundary pending={…}>`, the server streams it; created outside one, the first byte waits for it.
- `await q.fetch(input)` in `load`, handlers and other server functions (Q001 otherwise).
- `m(input)` in handlers. `m.pending.value`, `m.error.value`. It rejects with an `FnError`: `.message`, `.code`, `.status`, `.issues`.
- Refuse with `throw new FnError({ message: 'Not yours' }, 403)`, a user-facing message and a status.
- `redirect('/x')` in `load` (307) or `run` (the client follows).
- `tags: ({ id }) => ['todos', `todo:${id}`]` and `invalidates: ({ id }) => […]` take the input.
- `cache: { life: 'minutes' }` shares a value across requests, so it can't read `ctx.user` (Q006); add `scope: 'user'` for one value per user.
- `output: schema` is checked in dev (C002) and goes in `.weft/contract.json`.

A table a function touches must be in its `tags`/`invalidates` (Q011): a tag named after the table, or `table:…`.

**`auth: 'user'` says who is calling, not what they may touch.** A `run` taking a row's id must check that row belongs
to `ctx.user`. `and(eq(todos.id, input.id), eq(todos.userId, ctx.user.id))` in the `where` is the usual way.

## Publishing

For content an owner edits and every visitor reads (a menu, settings, pages, a search index). Visitors read from the
shared cache, edits go to a draft the owner can preview, and publishing refreshes the cache before the next visitor
arrives.

```ts
// what every visitor reads: cached, and re-run in the
// background the moment an edit invalidates it
export const menu = query({
  tags: ['menu'],
  cache: { life: 'hours', warm: true },
  run: ({ ctx }) => readMenu(ctx.db),
})

// the owner previews a draft; publishing applies it
export const startPreview = mutation({
  input: z.object({ draft: z.int() }),
  auth: 'user',
  run: ({ input }) => preview.start(String(input.draft)),
})
export const publish = mutation({
  input: z.object({ draft: z.int() }),
  auth: 'user',
  invalidates: ['menu'],
  run: async ({ input, ctx }) => {
    await applyDraft(ctx.db, input.draft)
    preview.stop()
    // once the response is out: the owner never waits
    after(() => writeSnapshot())
  },
})
```

- `warm: true` is for values that every visitor shares: no `auth` and no `scope: 'user'`.
- `preview.start(value)` sets an http-only cookie. While it's there, every query on that browser runs fresh and is
  never written to the shared cache, so draft data can't leak to anyone else. What the value means is the app's:
  `src/context.server.ts` reads `preview.id()`, checks that `ctx.user` may see that draft, and gives `run` a `db`
  with the draft applied (for example, a transaction that `after()` rolls back).
- A mutation's refreshes read as the browser's next GET will, with the preview cookie the mutation set or cleared.
  The admin sees its draft as it saves, and its live data again right after `preview.stop()`.
- `after(fn)` runs once the response has finished streaming or the call has answered, including when the visitor
  leaves early. Use it for a rollback, a snapshot, a git push or an email. A failure is reported as `E_AFTER` and
  doesn't stop the rest.

## Form fields

`form.field(name)` restores the raw submitted value, which can
be a string or an array for repeated names. Pass `'text'` or
`'email'` as the second argument for a string-valued input:
`form.field('email', 'email')`. If a name was repeated, these
modes restore its first value. Pass `'multiple'` to restore an
array, including when only one value was submitted. Missing
values stay absent. Use the raw default for checkbox and radio
fields when their submitted values need no projection.
`form.value(name)` always reads the raw restored value.

## Database

Drizzle, async on every driver: `await ctx.db.select()…`, `const [row] = await ….returning()`,
`await ctx.db.transaction(async tx => …)`. Change `src/db/schema.ts`, run `weft db generate` (Q015 until
you do), reload: migrations apply before the next statement a request runs (Q014 names a missing table). Never edit
`drizzle/` by hand. A page with no queries needs no database: with it down it still serves, and a request that does use
it answers 503 with Q016, then works once the database is back, no restart.

Access beyond ownership goes in the `where`, so a stranger's id matches no row: `and(eq(todos.id, input.id),
or(eq(todos.userId, ctx.user.id), exists(ctx.db.select({ one: sql\`1\` }).from(shares).where(…))))`. A mutation touching
two queries' rows calls `cache.update` once for each in `optimistic`, and names both tags in `invalidates`. Tags are
tables' names: Q011 checks them at run time, in `weft dev`, not in `weft check`.

## Auth

`ctx.user` and `ctx.session` come from `session(auth, request)` (`@weft-js/start/auth`) in `src/context.server.ts`. Sign-in is a mutation:

```ts
// src/server/session.ts
import { mutation, redirect } from '@weft-js/start'
import { forward } from '@weft-js/start/auth'
import { z } from 'zod'
import auth from '#/auth.server'

export const signIn = mutation({
  auth: 'public',
  input: z.object({ email: z.email(), password: z.string().min(8) }),
  run: async ({ input, ctx }) => {
    await forward(ctx, auth.api.signInEmail({
      body: input,
      headers: ctx.request.headers,
      asResponse: true,
    }))
    // A new session needs a full load; cached data won't survive.
    redirect('/todos') // A004 without a full load
  },
})
```

A guard: `export const load = ({ ctx }: LoadArgs) => ctx.user ?? redirect('/login')` in the layout above the pages.

`BETTER_AUTH_URL` in `.env` must match where the app runs: on another port (`weft dev --port`), sign-in answers
`INVALID_ORIGIN`.

**Login is an opaque token in the database, not a JWT.** The HTTP-only cookie holds a random token, so a session can be
revoked by deleting its row, and nothing about it can outlive that. A JWT can't be taken back before it expires.

**The session cache.** `createAuth` turns on Better Auth's cookie cache: an HTTP-only `session_data` cookie (`compact`:
signed, not encrypted) that spares a page and a query their two
session reads for **5 minutes**. So a revoked session can still be shown pages for up to 5 minutes. It can't write: a
mutation, a realtime connection and Better Auth's own routes always read the database, without you asking, and
sign-out and a password change clear the cookie. A request past the window reads the database and renews it.

```ts
// A shorter window
createAuth({
  db, secret,
  options: { database, session: { cookieCache: { maxAge: 60 } } },
})
// Every request reads the database
createAuth({
  db, secret,
  options: {
    database, session: { cookieCache: { enabled: false } },
  },
})
```

A hand-written provider follows the same rule: its `session` may cache for GET, never for another method.

**API access.** JWTs are for other services and API clients only, and never log a browser in. `GET /api/auth/token`, with a
live session, gives a token good for 15 minutes; `GET /api/auth/jwks` is public, so a service verifies it with the public
keys and no database (`iss` and `aud` are `BETTER_AUTH_URL`). Signing keys live in the `jwks` table of the auth schema. A
function takes a token only if it's listed, and `auth: 'user'` still applies:

```ts
createAuth({
  db, secret, options,
  api: {
    functions: () => [orders, shipOrder],
    jwt: {
      audience: 'https://api.example.com', expirationTime: '15m',
    },
  },
})
```

    GET  /_weft/fn/<id>?i=<json>   authorization: Bearer <token>
    POST /_weft/fn/<id>            authorization: Bearer <token>, content-type: application/json, x-weft: 1, body {"i": input}

`<id>` is `fnOf(orders).$id`. `ctx.user` is what the token says and `ctx.session` is `null`. An unlisted function ignores the
token. A token can't be revoked, so reads last until it expires; a mutation also checks that its session still exists.
With no `BETTER_AUTH_URL` or fixed `baseURL`, no token is accepted, since nothing could check `iss` and `aud`.
`api: false` removes all of this.

## Runtimes

The CLI runs on whichever of the three starts it, with none of the others installed: `bun --bun`, or `deno run -A
npm:@weft-js/cli`. `npm create @weft-js`, `bun create @weft-js` and `deno run -A npm:@weft-js/create` each scaffold for their own runtime
and package manager. HMR and sockets in `weft dev` work on all three.

A save in `weft dev` keeps the page: a component or route swaps in place with its `state`, typed input, focus and scroll;
CSS updates; a change to `load`, `meta` or server code refetches the page's data in place. `state` keeps its value while
its name and initializer stay the same. Adding or removing a route, or a module that exports more than components with
nothing above it to take the update, is a full reload, and the terminal says why. A tab that hit a syntax error comes back
when it's fixed.

`weft build` targets `runtime` in weft.config.ts (`node`, `bun`, `deno`; `--runtime` overrides), which is the runtime
that ran it if unset, and writes `.output/` and `.weft/contract.json`. Runtime-specific APIs (`Bun.*`, `Deno.*`, `better-sqlite3`) in server
code break the other targets; `node:` modules and web APIs work on all three.

## Realtime

Never poll, and never open a socket yourself (R007, T013): a live query, a `stream` and a `channel` reconnect, resume and
clean up for you.

**Live queries need no server code.** Tags are the contract: any mutation that invalidates one of the query's tags,
on any tab, refetches it for every reader. Unchanged rows keep their identity, so the page writes what changed.

```tsx
// Same Resource as listTodos(), plus todos.live.value
const todos = listTodos.live()
// 'connecting' | 'live' | 'degraded' | 'reconnecting' | 'offline'
<p>{todos.live.value}</p>
```

A live query needs `tags` (W053), and its mutations need one of them in `invalidates` (R003 in dev).

**Topics and streams carry messages.** Define them in server modules, next to queries:

```ts
// src/server/prices.ts
import { stream, topic } from '@weft-js/start'
import { z } from 'zod'

const Price = z.object({ symbol: z.string(), price: z.number() })

export const priceTopic = topic('prices', {
  key: z.string().max(12), message: Price,
})
export const prices = stream({
  // Bound the input (R005).
  input: z.object({ symbols: z.array(z.string().max(12)).max(50) }),
  message: Price,
  auth: 'user', // optional; re-checked every 5 minutes
  async *run({ input, signal, lastEventId }) {
    // Subscribe first (R006).
    yield* priceTopic.subscribe(input.symbols, {
      signal, after: lastEventId,
    })
  },
})
// Anywhere on the server:
// await priceTopic.publish('AAPL', { symbol: 'AAPL', price: 1 })
```

```tsx
const tick = prices({ symbols: ['AAPL'] }) // latest: tick.value
// Input is tracked; `skip` works.
const board = prices(() => ({ symbols: syms.value }), {
  fold: (acc, m) => ({ ...acc, [m.symbol]: m }),
  initial: {}, keep: '30s',
})
```

Never fold a stream with `watch` into `state` (W052): that list dies with the component. `fold` lives in the cache, so
a remount within `keep` finds it. Without `fold` you get the latest value, and a slow client skips messages.
`yield tracked(row.id, row)` from your own source gives a resumed `run` that id as `lastEventId`. `lastEventId` is
undefined after a reset: start again, or read from the database.

**One instance needs nothing.** Several need a bus: `weft build` refuses the memory bus on a multi-instance preset (R002).

```ts
// src/realtime.server.ts
import { realtime } from '@weft-js/start'
import { postgresBus } from '@weft-js/start/bus/postgres'

export default realtime({
  bus: postgresBus({ url: process.env.DATABASE_URL! }),
  origins: ['https://other.example'],
  maxDuration: 300,
})
```

`postgresBus` needs a direct connection: pgBouncer in transaction mode breaks LISTEN. `maxDuration` is the platform's
response limit in seconds: streams end 10 s earlier and resume. `stale` is true when the server runs a newer build
than this tab: offer a reload.

`weft add @weft-js/realtime-redis` or `@weft-js/realtime-nats` puts a bus in `plugins`, on `REDIS_URL` or `NATS_URL`; a `bus` set here
still wins. `durableObjectBus({ namespace })` (`@weft-js/realtime-durable-object`, the `cloudflare_durable` preset only) needs a
binding, so it's set here.

Payments: `weft add pay`, then `ctx.entitlements` and `requires: ['pro']` on any function. `weft docs pay`. A query's `tags`
can take `ctx`, for one user's tag: `tags: (_, ctx) => [`orders:${ctx.user.id}`]`.

**Testing** uses the real hub and client over `@weft-js/core/test`'s fake transport: `await net.settle()`, then
`await net.push(prices, message)`, `await net.poke('todos')`, `await net.drop()`, `net.offline()`, `net.reconnects()`,
`net.subscriptions()`.

## Writes from outside the app

`.live()` already follows mutations. A cron job, `psql`, a worker or another service writes nowhere near them: give the database's writes to `realtime` and they reach the same queries, the same way.

<!-- example: skip needs a notes table in the app's schema -->
```ts
// src/realtime.server.ts
import { realtime } from '@weft-js/start'
import { dbChanges } from '@weft-js/start/changes'
import { db } from '#/db/index.server'
import { notes } from '#/db/schema'

export default realtime({ changes: dbChanges(db, [notes]) })
```

<!-- example: skip needs a notes table in the app's schema -->
```ts
// src/server/notes.ts
import { query } from '@weft-js/start'
import { eq } from 'drizzle-orm'
import { notes } from '#/db/schema'

export const myNotes = query({
  tags: ['notes'], // table name, or `notes:${id}` for one row
  auth: 'user',
  live: { required: true, verify: 'staging' },   // both optional
  run: ({ ctx }) => ctx.db
    .select()
    .from(notes)
    .where(eq(notes.owner, ctx.user.id)),
})
```

Then `weft db live` writes the migration (triggers for SQLite, MySQL and Postgres), and you apply it. Tags are `notes` and `notes:<pk>`; a compound key joins with `:`. `dbChanges(db, tables, { tagged })` maps a change to your own tags, and for MongoDB it's `mongoChanges(db, collections)` from `@weft-js/db/mongo`.

A notification carries a table and primary keys, never a column. Each client refetches through its own `query`, so `auth` and every filter run for that user: someone who can't see a row gets the same answer as before. An app's own write is not poked twice, and a bulk write is one refetch: over 32 ids in a statement it's a table-level change, which reaches `notes` and every `notes:…`. Limits: at most one flush per 250 ms; a dropped feed pokes every table when it's back.

**What you get depends on where it runs**, so ask: `weft doctor` (`--preset vercel`) says what works for a target, and `weft check` warns about it. At startup the server tries the real thing, settles on a mode, and logs it once. The same answer is on the page:

```tsx
const notes = myNotes.live()
// 'degraded': connected; outside writes arrive late or not at all
notes.live.value
notes.liveMode.value   // 'feed' | 'external' | 'poll' | 'app' | 'off'
```

| Mode | Means |
|---|---|
| `feed` | This server hears every change. |
| `external` | A separate listener hears them, and publishes to the bus. |
| `poll` | A fallback: late, and by table only. `degraded`. |
| `app` | No `changes`: mutations only. Not degraded; it's what you asked for. |
| `off` | There's nothing to read: mutations only. `degraded`. |

| Database | How | Limits |
|---|---|---|
| Postgres | Triggers and NOTIFY, on one held connection | A pooler in transaction mode loses it: the probe finds that out by trying, and falls to `postgres-stats`. Give it a direct connection with `{ listenUrl }`. Applying the migration needs TRIGGER; NOTIFY is limited to 8000 bytes, so big keys are table-level. Row-level security is yours: triggers fire regardless, and the refetch applies it. |
| SQLite | `PRAGMA data_version` every 100 ms on a second connection, then the triggers' log. This is polling, of the cheapest read there is | Same host only: a network file system turns it `off`. The log holds 4096 rows; a reader past that pokes every table. With no triggers, any commit pokes every listed table. Instances on other machines can't share the file anyway. |
| MySQL | The triggers' log, read every 500 ms | Polling, with a row in the log per row written. No in-order commit guarantee, so it reads a window of 512 back. Each server prunes old rows from `__weft_changes`. |
| MongoDB | A change stream | Needs a replica set: a standalone is `off`. Barriers use a capped `__weft_barrier`, about 120 ms slower per change. |

Polling here is the framework's watcher, in one place on the server. R007 and T013 still hold for your code: never poll in it.

**On Vercel, Netlify, Lambda, Azure Functions, Firebase, Cloudflare and Deno Deploy** a process ends with its request, so nothing can hold a connection. Mutations still work, and `.live()` shows `degraded` (R014). Two ways to get the feed: deploy to a server preset, or run one always-on listener anywhere, with a bus both can reach:

<!-- example: skip two files in one block; needs a notes table -->
```ts
// listener.ts: on a VPS, Fly or Railway. `weft db listen` runs it.
export default realtime({
  bus: postgresBus({ url: env.DATABASE_URL }),
  changes: dbChanges(db, [notes]),
})
// the app, on Vercel
export default realtime({
  bus: postgresBus({ url: env.DATABASE_URL }),
  changes: dbChanges(db, [notes], { listener: 'external' }),
})
```

`weft db listen` loads your server modules from source, so it runs from a checkout with dependencies installed, and with the same env as the app. A listener that stops is noticed: its heartbeat ends, and within a minute `.live()` shows `reconnecting`.

**`live: { required: true }`** (or `q.live(input, { required: true })`) refuses to ship a page that only looks live. `weft check` and `weft build` fail with R013 when the target can't do it. What only a running server can know fails at startup with R015: the process stops rather than serve stale data, and in dev it says so instead. For a health route, `liveHealth()` from `@weft-js/start` answers `ok: false` while a required query has no working feed. An outage after a good start reports there too, and doesn't stop the server: restarting wouldn't bring the database back, and the feed recovers by itself.

**`verify`** proves the chain end to end on every `weft check` and `weft build`, cached by query and contract:

```ts
live: { required: true, verify: 'staging' } // name in config
live: { verify: { url: 'https://staging.example.dev' } } // app
// A database, as an outside writer
live: { verify: { db: process.env.STAGING_DATABASE_URL } }
// Finds WEFT_STAGING_URL or STAGING_DATABASE_URL
live: { verify: true }
```

Setup, once:

```ts
// weft.config.ts
live: {
  targets: { staging: {
    url: 'https://staging.example.dev',
    db: 'STAGING_DATABASE_URL',
    production: false,
  } },
}
```

Set `STAGING_DATABASE_URL`, and `WEFT_STAGING_COOKIE` and `WEFT_STAGING_OTHER_COOKIE` for a signed-in user and one who shouldn't see the row. If the query's table has a required column, say what to write: `verify: { target: 'staging', row: { owner: 'alice' } }`.

It writes one marked row through a separate connection, then checks each link: `trigger`, `write`, `notify`, `app`, `poke`, `refetch`, `denied`, `cleanup`. It reports each one's time, and a failure names the link. Both `url` and `db` test the whole chain; with one, it says which links it didn't (R023). Postgres only for now.

A target must be named with `production: false`, or have a host that says staging, and anything that looks like production is refused either way (R022). It touches only its own row, marked uniquely so builds don't collide, and removes it even on failure. The row can't sit in a transaction, because NOTIFY only fires on commit. A password in source is an error (R020): read it from the environment. A target that isn't available fails `weft build`, and warns and skips in `weft check` and dev (R021).

## Channels

`channel` is a WebSocket with named messages each way, for what the client sends often: chat, typing, cursors. For
anything else use a mutation and `.live()`. Define it in a server module. `authorize` is required (R001), and runs on
every join and every 5 minutes.

<!-- example: skip needs the app's own Message schema, isMember and insertMessage -->
```ts
// src/server/chat.ts
import { channel } from '@weft-js/start'
import { z } from 'zod'
import { isMember, insertMessage, Message } from '#/server/messages'

export const room = channel({
  params: z.object({ roomId: z.string().max(64) }),
  // False gives status 'unauthorized' (R011).
  authorize: ({ ctx, params }) => isMember(ctx.user, params.roomId),
  // Always validated; bound messages (R005).
  client: { say: z.object({ text: z.string().min(1).max(2000) }) },
  server: { said: Message }, // validated in dev and tests
  on: {
    say: async ({ msg, ctx, params, room }) => {
      // Throw StartError or FnError to refuse `send`.
      const row = await insertMessage(ctx, params.roomId, msg.text)
      // { exceptSelf: true } skips the sender.
      await room.publish('said', row)
    },
  },
  limits: { perSecond: 10 }, // default 20 a second per socket
})
// From a mutation or a job:
// await room.in({ roomId }).publish('said', row)
```

```tsx
// Tracked; `skip` leaves; { keep: '30s' }
const chat = room.connect(() => ({ roomId: props.roomId }))
// Derived<Message[]>, kept in the cache
const said = chat.collect('said', { max: 200, key: m => m.id })
chat.on('typing', ({ userId }) => show(userId)) // owner removes it
// Resolves on the server's ack; rejects with the refusal
await chat.send('say', { text })
// 'connecting' | 'open' | 'reconnecting' | 'closed' | 'unauthorized'
chat.status.value
```

**The channel is a wire, not a log.** A reconnect replays what the last 60 s or 256 messages hold, per instance. Past
that, or on a new server, `collect` empties, `chat.resets` ticks and `chat.onReset(fn)` runs. So what must survive goes
in the database: read history with a query, `chat.collect` the new messages with `key`, and invalidate the query on a
reset.

<!-- example: skip continues the chat example above -->
```tsx
import { derived } from '@weft-js/core'
import { invalidate } from '@weft-js/start'
const history = listMessages({ roomId })
const said = chat.collect('said', { key: m => m.id })
chat.onReset(() => invalidate('messages'))
const all = derived(() =>
  dedupe([...(history.value ?? []), ...said.value]),
)
```

A refused join is only known once the socket is up, and `status` is `'connecting'` on the server. To render "not
allowed" on the server, share one function between `authorize` and the route's `load` (`allowed: mayEnter(ctx.user, id)`).
`authorize` doesn't narrow types: `ctx.user` in `on` is still nullable. Ephemeral messages such as `typing` go with
`{ exceptSelf: true }`, sent at most once a second.

In JSX leave a handler's `e` unannotated. A separate handler takes `Event & { currentTarget: HTMLInputElement }`: `input`
is a plain `Event` in TypeScript's DOM types, not `InputEvent`.

`send` has no offline queue. While the socket reconnects it waits up to 10 s, then rejects. A `send` in flight when the
socket dies rejects too, because it may or may not have arrived: put an id in the message if a retry must not double.

**Origin:** the socket takes the app's own origin and `realtime({ origins })`, exactly (R010, R004). There's nothing
else to configure, and no handler of your own (R004, R007). `invalidate('session:' + userId)` after a sign-out or a
kick re-checks that user's sockets at once. A user whose session ended is closed with 4401, and `status` is
`unauthorized`.

**Shared state** is one value per key, last writer wins, as a box. A write is optimistic. A refused one goes back and
sets `.error`.

<!-- example: skip needs the app's isParticipant and isPresenter rules -->
```ts
import { sharedState, skip } from '@weft-js/start'
import { z } from 'zod'

export const deckSlide = sharedState('deck-slide', {
  key: z.string().max(64),
  value: z.number().int().max(999),
  initial: 0,
  // Both ({ ctx, key }) => boolean functions are required.
  authorize: { read: isParticipant, write: isPresenter },
})
await deckSlide.in(id).set(3) // on the server
// In defineState: State<number> & { status, error }
const slide = deckSlide.connect(() => (id.value ? id.value : skip))
```

Its value lives in server memory: it survives a restart only while another instance runs. What must last is a mutation.

**Tabs** need no server: `tabs.channel` is in `weft docs browser`, and a box kept the same in every tab
(`sync: 'tabs'`) is in `weft docs state`.

**Testing:** `room.connect` runs the real server code over the fake socket: `await net.settle()`, then
`await net.publish(room, { roomId }, 'said', row)`, `net.sent(room)`, `await net.drop()`, `await net.offline()`,
`await net.session({ user })`. From `@weft-js/core/test`, `tabs.post(name, msg)` and `tabs.posted(name)` play another tab, and two
`render()`s sharing one `storage` are two tabs.

## CSS on a page

A built page carries the CSS its first paint needs in a `<style>`, and links the rest at the end of its shell, where it blocks nothing above it. The links are at most two hashed files: one with what every route shares, one with the rest of that route. Client navigation loads each chunk's own CSS and waits for it.

The server finds the first-paint CSS by reading the page's HTML against a table from the build, with lookups and no CSS parsing. So the same HTML always gets the same CSS. Nothing depends on what rendered it: a prerendered page, a `@weft static` level, a page from a cache and a live render take one path, and there is no `Vary`. A streamed chunk carries only the styles that response hasn't sent.

Rules for hover, focus and other states aren't in the first paint, so they work once the late sheet lands. A class a head script sets isn't in the HTML: name it in `site.criticalKeep`. A dial value a head script sets with `dataset.x = 'y'` is found by itself. A stored dial choice the head doesn't name shows the default until the sheet lands.

If part of a page must not show before the late sheet, mark it:

```tsx
<section data-weft="styled">…</section>
```

It keeps its room, stays hidden until the sheet lands, and shows anyway after 3 s with no JavaScript, so a missing file can't hide it for good. Assistive tech doesn't see it while hidden. `weft check` warns on this mark on main content or an `h1` (D040). Nothing adds the mark for you: the first paint already holds every rule that matches the HTML.

`site.criticalCss: false` goes back to one sheet per chunk, inlined up to 48 KB and linked past that. `site.inlineCss: false` keeps plain links.

**Deploying.** A page cached before a deploy links the sheets it was built with, so `weft build` keeps old combined sheets for 30 days in `.weft/sheets`. Keep that folder between builds, or the old files go: a cached page then paints from its own `<style>`, without hover and focus styles until it is cached again. The folder is copied into the build's assets, so a preset that serves those assets needs nothing else.

