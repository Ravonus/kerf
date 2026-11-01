# Full stack: `@weft/start`

## Files

```
src/routes/**            file routes: _layout.tsx, index.tsx, [id].tsx, [...rest].tsx, 404.tsx, _error.tsx
src/server/**            server modules: queries and mutations (the client gets stubs); a Rust body: `weft docs rust`
src/db/schema.ts         Drizzle tables; safe to import anywhere
src/db/index.server.ts   the database client
src/auth.server.ts       the auth provider (Better Auth by default), mounted at /api/auth/*
src/context.server.ts    what `ctx` holds
```

Any auth provider works: `defineAuth` from `@weft/start/auth` takes a `handler(request)` for `/api/auth/*` and a
`session(request)` that returns `{ user, session }`. `ctx.user` and `auth: 'user'` come from those two.

## Routes

```tsx
import type { LoadArgs, Meta, RouteProps } from '@weft/start'

export const load = async ({ params, ctx }: LoadArgs<'/lists/[id]'>) => ({ list: await getList.fetch({ id: params.id }) })
export const meta: Meta<typeof load> = ({ data }) => ({ title: data.list.name })
export default function List(props: RouteProps<typeof load, '/lists/[id]'>) { return <h1>{props.data.list.name}</h1> }
```

Read `props.data` in JSX or `derived`, not in the component body (W001).

Import your own code as `#/server/todos`, which is `src/server/todos`. That alias is `paths` in `tsconfig.json`: change it or add your own there, and Vite and `weft check` follow. Generated files have their own prefix: `weft:slot/<id>` and `weft:tokens/<name>`.

`load` and `meta` never ship to the client. A layout's `load` runs before its children's, so it's where a guard goes.
Links are `<Link href>`; code navigates with `navigate(href)`.

## Server functions

```ts
// src/server/todos.ts
import { mutation, query } from '@weft/start'
import { schemasOf } from '@weft/start/db'
import { and, eq } from 'drizzle-orm'
import * as schema from '../db/schema'

const { todos } = schema
const schemas = schemasOf(schema, { todos: { title: s => s.trim().min(1) } })

export const listTodos = query({
  tags: ['todos'],                  // what invalidates it
  auth: 'user',                     // anyone else gets A002; ctx.user is non-null here
  run: ({ ctx }) => ctx.db.select().from(todos).where(eq(todos.userId, ctx.user.id)),
})

export const addTodo = mutation({
  input: schemas.todos.insert.pick({ title: true }),
  auth: 'user',
  invalidates: ['todos'],           // queries with this tag come back in the same response
  optimistic: ({ input }, cache) => cache.update(listTodos, undefined, l => void l.push({ id: `tmp:${input.title}`, title: input.title, done: false, userId: '' })),
  run: async ({ input, ctx }) => {
    const [row] = await ctx.db.insert(todos).values({ id: crypto.randomUUID(), userId: ctx.user.id, createdAt: Date.now(), ...input }).returning()
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

`ctx.user` and `ctx.session` come from `session(auth, request)` in `src/context.server.ts`. Sign-in is a mutation:

```ts
export const signIn = mutation({
  input: z.object({ email: z.email(), password: z.string().min(8) }),
  run: async ({ input, ctx }) => {
    await forward(ctx, auth.api.signInEmail({ body: input, headers: ctx.request.headers, asResponse: true }))
    redirect('/todos')              // with a new session, a full load: nothing cached survives (A004 without one)
  },
})
```

A guard: `export const load = ({ ctx }: LoadArgs) => ctx.user ?? redirect('/login')` in the layout above the pages.

`BETTER_AUTH_URL` in `.env` must match where the app runs: on another port (`weft dev --port`), sign-in answers
`INVALID_ORIGIN`.

## Runtimes

`weft dev` runs on Node. `weft build` targets `runtime` in weft.config.ts (`node`, `bun`, `deno`; `--runtime` overrides)
and writes `.output/` and `.weft/contract.json`. Runtime-specific APIs (`Bun.*`, `Deno.*`, `better-sqlite3`) in server
code break the other targets; `node:` modules and web APIs work on all three.

## Realtime

Never poll, and never open a socket yourself (R007, T013): a live query, a `stream` and a `channel` reconnect, resume and
clean up for you.

**Live queries need no server code.** Tags are the contract: any mutation that invalidates one of the query's tags,
on any tab, refetches it for every reader. Unchanged rows keep their identity, so the page writes what changed.

```tsx
const todos = listTodos.live()             // the same Resource as listTodos(), plus todos.live.value
<p>{todos.live.value}</p>                  // 'connecting' | 'live' | 'degraded' | 'reconnecting' | 'offline'
```

A live query needs `tags` (W053), and its mutations need one of them in `invalidates` (R003 in dev).

**Topics and streams carry messages.** Define them in server modules, next to queries:

```ts
export const priceTopic = topic('prices', { key: z.string().max(12), message: Price })
export const prices = stream({
  input: z.object({ symbols: z.array(z.string().max(12)).max(50) }),   // bound it (R005)
  message: Price,
  auth: 'user',                                                        // optional; re-checked every 5 minutes
  async *run({ input, signal, lastEventId }) {
    yield* priceTopic.subscribe(input.symbols, { signal, after: lastEventId })   // subscribe first (R006)
  },
})
await priceTopic.publish('AAPL', { symbol: 'AAPL', price: 1 })         // anywhere on the server
```

```tsx
const tick = prices({ symbols: ['AAPL'] })                             // tick.value: the latest message
const board = prices(() => ({ symbols: syms.value }), {                // input is tracked; `skip` works
  fold: (acc, m) => ({ ...acc, [m.symbol]: m }), initial: {}, keep: '30s',
})
```

Never fold a stream with `watch` into `state` (W052): that list dies with the component. `fold` lives in the cache, so
a remount within `keep` finds it. Without `fold` you get the latest value, and a slow client skips messages.
`yield tracked(row.id, row)` from your own source gives a resumed `run` that id as `lastEventId`. `lastEventId` is
undefined after a reset: start again, or read from the database.

**One instance needs nothing.** Several need a bus: `weft build` refuses the memory bus on a multi-instance preset (R002).

```ts
// src/realtime.server.ts
import { realtime } from '@weft/start'
import { postgresBus } from '@weft/start/bus/postgres'
export default realtime({ bus: postgresBus({ url: env.DATABASE_URL }), origins: ['https://other.example'], maxDuration: 300 })
```

`postgresBus` needs a direct connection: pgBouncer in transaction mode breaks LISTEN. `maxDuration` is the platform's
response limit in seconds: streams end 10 s earlier and resume. `stale` is true when the server runs a newer build
than this tab: offer a reload.

`weft add @weft/realtime-redis` or `@weft/realtime-nats` puts a bus in `plugins`, on `REDIS_URL` or `NATS_URL`; a `bus` set here
still wins. `durableObjectBus({ namespace })` (`@weft/realtime-durable-object`, the `cloudflare_durable` preset only) needs a
binding, so it's set here.

Payments: `weft add pay`, then `ctx.entitlements` and `requires: ['pro']` on any function. `weft docs pay`. A query's `tags`
can take `ctx`, for one user's tag: `tags: (_, ctx) => [`orders:${ctx.user.id}`]`.

**Testing** uses the real hub and client over `weft/test`'s fake transport: `await net.settle()`, then
`await net.push(prices, message)`, `await net.poke('todos')`, `await net.drop()`, `net.offline()`, `net.reconnects()`,
`net.subscriptions()`.

## Writes from outside the app

`.live()` already follows mutations. A cron job, `psql`, a worker or another service writes nowhere near them: give the database's writes to `realtime` and they reach the same queries, the same way.

```ts
// src/realtime.server.ts
import { realtime } from '@weft/start'
import { dbChanges } from '@weft/start/changes'
import { db } from './server/db'
import { notes } from './server/schema'

export default realtime({ changes: dbChanges(db, [notes]) })
```

```ts
export const myNotes = query({
  tags: ['notes'],                               // table name, or `notes:${id}` for one row
  live: { required: true, verify: 'staging' },   // both optional
  run: (_, { ctx }) => db.select().from(notes).where(eq(notes.owner, ctx.user.id)),
})
```

Then `weft db live` writes the migration (triggers for SQLite, MySQL and Postgres), and you apply it. Tags are `notes` and `notes:<pk>`; a compound key joins with `:`. `dbChanges(db, tables, { tagged })` maps a change to your own tags, and for MongoDB it's `mongoChanges(db, collections)` from `@weft/db-mongo`.

A notification carries a table and primary keys, never a column. Each client refetches through its own `query`, so `auth` and every filter run for that user: someone who can't see a row gets the same answer as before. An app's own write is not poked twice, and a bulk write is one refetch: over 32 ids in a statement it's a table-level change, which reaches `notes` and every `notes:…`. Limits: at most one flush per 250 ms; a dropped feed pokes every table when it's back.

**What you get depends on where it runs**, so ask: `weft doctor` (`--preset vercel`) says what works for a target, and `weft check` warns about it. At startup the server tries the real thing, settles on a mode, and logs it once. The same answer is on the page:

```tsx
const notes = myNotes.live()
notes.live.value       // … | 'degraded': connected, and outside writes arrive late or not at all
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

```ts
// listener.ts: on a VPS, Fly or Railway. `weft db listen` runs it.
export default realtime({ bus: postgresBus({ url: env.DATABASE_URL }), changes: dbChanges(db, [notes]) })
// the app, on Vercel
export default realtime({ bus: postgresBus({ url: env.DATABASE_URL }), changes: dbChanges(db, [notes], { listener: 'external' }) })
```

A listener that stops is noticed: its heartbeat ends, and within a minute `.live()` shows `reconnecting`.

**`live: { required: true }`** (or `q.live(input, { required: true })`) refuses to ship a page that only looks live. `weft check` and `weft build` fail with R013 when the target can't do it. What only a running server can know fails at startup with R015: the process stops rather than serve stale data, and in dev it says so instead. For a health route, `liveHealth()` from `@weft/start` answers `ok: false` while a required query has no working feed. An outage after a good start reports there too, and doesn't stop the server: restarting wouldn't bring the database back, and the feed recovers by itself.

**`verify`** proves the chain end to end on every `weft check` and `weft build`, cached by query and contract:

```ts
live: { required: true, verify: 'staging' }                                  // a name in weft.config.ts
live: { verify: { url: 'https://staging.example.dev' } }                     // a running app
live: { verify: { db: process.env.STAGING_DATABASE_URL } }                   // a database, as an outside writer
live: { verify: true }                                                       // finds WEFT_STAGING_URL, STAGING_DATABASE_URL
```

Setup, once:

```ts
// weft.config.ts
live: { targets: { staging: { url: 'https://staging.example.dev', db: 'STAGING_DATABASE_URL', production: false } } }
```

Set `STAGING_DATABASE_URL`, and `WEFT_STAGING_COOKIE` and `WEFT_STAGING_OTHER_COOKIE` for a signed-in user and one who shouldn't see the row. If the query's table has a required column, say what to write: `verify: { target: 'staging', row: { owner: 'alice' } }`.

It writes one marked row through a separate connection, then checks each link: `trigger`, `write`, `notify`, `app`, `poke`, `refetch`, `denied`, `cleanup`. It reports each one's time, and a failure names the link. Both `url` and `db` test the whole chain; with one, it says which links it didn't (R023). Postgres only for now.

A target must be named with `production: false`, or have a host that says staging, and anything that looks like production is refused either way (R022). It touches only its own row, marked uniquely so builds don't collide, and removes it even on failure. The row can't sit in a transaction, because NOTIFY only fires on commit. A password in source is an error (R020): read it from the environment. A target that isn't available fails `weft build`, and warns and skips in `weft check` and dev (R021).

## Channels

`channel` is a WebSocket with named messages each way, for what the client sends often: chat, typing, cursors. For
anything else use a mutation and `.live()`. Define it in a server module. `authorize` is required (R001), and runs on
every join and every 5 minutes.

```ts
// src/server/chat.ts
export const room = channel({
  params: z.object({ roomId: z.string().max(64) }),
  authorize: ({ ctx, params }) => isMember(ctx.user, params.roomId),   // false: status 'unauthorized' (R011)
  client: { say: z.object({ text: z.string().min(1).max(2000) }) },    // always validated; bound them (R005)
  server: { said: Message },                                           // validated in dev and tests
  on: {
    say: async ({ msg, ctx, params, room }) => {
      const row = await insertMessage(ctx, params.roomId, msg.text)    // throw StartError or FnError to refuse `send`
      await room.publish('said', row)                                  // `{ exceptSelf: true }` skips the sender
    },
  },
  limits: { perSecond: 10 },                                           // default 20 a second per socket
})
await room.in({ roomId }).publish('said', row)                         // from a mutation or a job
```

```tsx
const chat = room.connect(() => ({ roomId: props.roomId }))            // tracked; `skip` leaves; { keep: '30s' }
const said = chat.collect('said', { max: 200, key: m => m.id })        // Derived<Message[]>, kept in the cache
chat.on('typing', ({ userId }) => show(userId))                        // removed with the owner
await chat.send('say', { text })                                       // resolves on the server's ack; rejects with the refusal
chat.status.value                                                      // 'connecting' | 'open' | 'reconnecting' | 'closed' | 'unauthorized'
```

**The channel is a wire, not a log.** A reconnect replays what the last 60 s or 256 messages hold, per instance. Past
that, or on a new server, `collect` empties, `chat.resets` ticks and `chat.onReset(fn)` runs. So what must survive goes
in the database: read history with a query, `chat.collect` the new messages with `key`, and invalidate the query on a
reset.

```tsx
import { invalidate, skip } from '@weft/start'
const history = listMessages({ roomId })
const said = chat.collect('said', { key: m => m.id })
chat.onReset(() => invalidate('messages'))
const all = derived(() => dedupe([...(history.value ?? []), ...said.value]))
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

```ts
export const deckSlide = sharedState('deck-slide', {
  key: z.string().max(64), value: z.number().int().max(999), initial: 0,
  authorize: { read: isParticipant, write: isPresenter },              // ({ ctx, key }) => boolean, both required
})
await deckSlide.in(id).set(3)                                          // on the server
const slide = deckSlide.connect(() => (id.value ? id.value : skip))    // in a defineState: State<number> & { status, error }
```

Its value lives in server memory: it survives a restart only while another instance runs. What must last is a mutation.

**Tabs:** `tabs.channel('cart', schema)` from `weft/browser` is a validated `BroadcastChannel`: `.post(msg)`, `.on(fn)`,
`.value`. `state(init, { persist: { in: 'local', schema, version: 1 }, sync: 'tabs' })` in a `defineState` keeps a box the
same in every tab, by key for plain objects, last writer wins. It needs `persist`, and not `session` (S008).

**Testing:** `room.connect` runs the real server code over the fake socket: `await net.settle()`, then
`await net.publish(room, { roomId }, 'said', row)`, `net.sent(room)`, `await net.drop()`, `await net.offline()`,
`await net.session({ user })`. From `weft/test`, `tabs.post(name, msg)` and `tabs.posted(name)` play another tab, and two
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

