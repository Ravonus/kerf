# 30. Realtime in `@weft/start`: `.live`, `topic`, `stream`, buses (Phase 3)

Status: **design written before the code, 2026-10-30; §10 records what was built and measured.** Inputs: PLAN §4.2,
[07](07-realtime-and-events.md) (the research; this note doesn't repeat it), [27](27-server-functions.md) (the cache
and transports this plugs into), [28](28-db-auth-runtimes.md) (the matrix, postgres.js). `channel` over crossws and
`tabs.channel` are Phase 3b; §9 lists what this leaves ready for them.

## 1. Decisions that research 07 left open

**A subscription set is changed in place, not by reopening.** Research 07 §9.2 reopens the SSE when the set changes.
That restarts every other `stream`'s `run` whenever a component mounts: a one-shot agent stream would be aborted and
rerun because someone opened a tab. So the connection has an id, and `POST /_weft/rt` with that id adds and removes
subscriptions. An unknown id (the other instance, or a restart) answers 404 and the client reconnects with the whole
set, which is the same path as any reconnect.

**Pokes have one ring; topics have one ring per channel.** Every instance listens to one `weft:poke` bus channel from
the first realtime request on, so a poke ring exists before anyone subscribes. A page rendered with `.live` carries
that ring's cursor (`#weft-rt`), and the first connect replays the gap between the render and the connection, instead
of refetching every live query after every hydration or missing a write in the gap. A client that has no cursor
(client navigation) refetches once on ack, because its data may be older than the subscription.

**Topic rings live while someone listens, and 60 s longer.** A topic channel is bus-subscribed on first use. Its ring
outlives the last subscriber by the ring's own 60 s, so a reconnecting client can resume; a channel nobody listened to
has no history, and a resume there is a `reset`.

**`tracked(id, msg)` carries a cursor through `yield`.** PLAN's `yield* topic.subscribe(keys, { after })` yields
messages. A message can't carry a cursor after a JSON round trip, and a primitive can't carry one at all, so
`subscribe` yields `tracked(cursor, message)` and `stream` unwraps it (the tRPC shape). A handler with its own ids
(a database row) can yield `tracked(row.id, row)`, and its `lastEventId` is that id. A plain `yield` has no cursor.

**A reset is an exception inside `run`.** `topic.subscribe({ after })` outside the window throws an internal reset.
The stream sends `r` (the client restarts its fold from `initial`) and calls `run` again with `lastEventId: undefined`,
as research 07 §3 says. Handlers contain no reset code.

**One server subscription, many folds.** Research 07 says folds live in the cache entry, and a component's `fold` is a
new closure on each mount. The fold's source text keys a view inside the entry: a remount finds its view again, and
two readers with different folds share one server subscription. Fold functions are replaced by the latest reader's.

**`fold` implies a buffer.** Latest-value backpressure silently breaks a fold. A reader with `fold` asks for
`buffer: 256` unless it says otherwise; a bare reader gets latest-value. An overflowing buffer is a `reset`, which a
fold survives and a silent drop doesn't.

**`.live` costs a query app a little, and an app without queries nothing.** `data.ts` holds the `.live` method and a
status box, and the first call `import()`s the client, so no chunk loads until then. `stream` imports the same client
statically, in chunks that use it. §10 has the measured cost.

**The tab's own mutation doesn't poke itself.** Single-flight already refreshed what it reads, so the poke would be a
second, useless refetch. A mutation sends its connection id (`x-weft-conn`) and the hub skips that connection.

**Session re-check is built here for `stream`.** PLAN puts the re-check with `channel` (3b), but an `auth: 'user'`
stream that outlives its session is the same hole. Each connection re-runs the app's context every 5 min for
subscriptions with `auth`, and ends those that fail with A002.

**Config is a file, like auth and context.** `src/realtime.server.ts` default-exports `realtime({ bus, origins,
limits, maxDuration })`, because a bus needs a run-time URL. The `realtime.bus` slot from research 13 stays declared;
plugin-provided buses are Phase 3b, and they implement this note's `Bus`.

## 2. API

```ts
// src/server/prices.ts
export const priceTopic = topic('prices', { key: z.string(), message: Price })
export const prices = stream({
  input: z.object({ symbols: z.array(z.string().max(12)).max(50) }),
  message: Price,
  auth: 'user',                                             // optional, as on query
  async *run({ input, ctx, signal, lastEventId }) { yield* priceTopic.subscribe(input.symbols, { signal, after: lastEventId }) },
})
await priceTopic.publish('AAPL', { symbol: 'AAPL', price: 1 })   // server only

// a component
const todos = listTodos.live({ listId })                    // Resource + todos.live: Derived<LiveStatus>
const tick = prices({ symbols: ['AAPL'] })                  // Stream<Price>: .value, .status, .error
const board = prices(() => ({ symbols: syms.value }), { fold: (acc, m) => ({ ...acc, [m.symbol]: m }), initial: {}, keep: '30s' })

// src/realtime.server.ts (optional: memory, own origin)
export default realtime({ bus: postgresBus({ url: env.DATABASE_URL }), origins: ['https://app.example'], maxDuration: 300 })
```

`LiveStatus` is `'connecting' | 'live' | 'reconnecting' | 'offline'`. `stream` adds `'done'`. `stale` from
`@weft/start` is a box: the server's build isn't the one this tab loaded.

## 3. The bus

```ts
export interface Bus {
  readonly name: string
  publish(channel: string, message: string): Promise<void>
  /** Resolves once listening. `gap`: messages may have been lost (a dropped LISTEN connection). */
  subscribe(channel: string, on: (message: string) => void, gap?: () => void): Promise<() => void>
  close?(): Promise<void>
}
```

Strings, at-most-once, ordered per publisher: everything a Redis or NATS client gives, and nothing about tags,
topics, rings or cursors. Those stay in the hub, per research 07 §3 ("replay lives in weft, not the bus").

- **`memoryBus()`** is a map of listener sets, delivered in a microtask (so a test can't depend on synchronous fan-out
  that no other bus has).
- **`postgresBus({ url })`** (`@weft/start/bus/postgres`) has one dedicated LISTEN connection, on one Postgres channel
  (`weft_bus`), with the logical channel inside the payload: Postgres identifiers stop at 63 bytes and tags don't.
  `NOTIFY` stops at 8,000 bytes, so a longer message goes base64 in numbered chunks inside one transaction, which
  Postgres delivers together and in order; no table, nothing to clean up. postgres.js calls `onlisten` on every
  reconnect, which is the `gap` signal: the hub moves the floor of its rings and resets everyone.

## 4. Wire

`POST /_weft/rt`, same-origin JSON with `x-weft: 1` like a mutation (research 27 §3), plus the Origin allowlist.

```jsonc
// request
{ "k": "<conn>",            // absent: open. present: change this connection (204, or 404 → reconnect)
  "c": "<epoch>:<seq>",     // the poke cursor
  "s": [[1, "q", "listTodos.ab12cd", { "listId": "x" }],               // n, kind, id, input
        [2, "s", "prices.ef34ab", { "symbols": ["A"] }, "<cursor>", 256]], // + cursor, buffer
  "d": [3] }                // subscriptions to drop
```

| Event | Data | Means |
|---|---|---|
| `h` | `{ k, e, b }` | hello: connection id, epoch, build |
| `a` | `[n, tags]` | a `.live` subscription is registered, with its tags |
| `p` | `{ t, c }` | poke: tag names, new cursor |
| `R` | `{ c }` | the poke cursor is out of the window: refetch everything live |
| `m` | `[n, cursor, msg]` | a stream message |
| `r` | `[n]` | stream reset |
| `f` | `[n]` | stream finished |
| `e` | `[n, { code, message }]` | a subscription failed and is gone |
| `b` | `{ retry }` | bye: reconnect after `retry` ms (`maxDuration`) |
| `: ping` | | every 20 s; the client gives up after 45 s of silence |

Compression is off and `x-accel-buffering: no` is set. `n` is the client's; two tabs reuse numbers freely.

## 5. Server: the hub

`hub.ts` has no runtime imports, like `exec.ts`, so one hub runs behind the HTTP route and behind the fake transport.
Both give it a sink (`write(event, data)`, `backlog()`, `close()`); HTTP's writes SSE bytes into a `ReadableStream`, the
fake's hands frames to the client after a JSON round trip. Nothing above the sink knows which it has.

- **Backpressure.** A sink over its high-water mark holds `m` frames per subscription (the last one, or up to
  `buffer`, then `reset`) and merges pokes by tag until `pull` drains them. Past 1 MiB queued: `b`, close, and the
  client resumes from cursors, instead of growing memory.
- **Limits** (research 07 §9.2): 100 subscriptions per connection, 10 connections per user, 64 KiB request body,
  1 MiB message. Refusals are R008/R009.
- **`invalidate`** in `exec.ts` calls `runtime.poke(tags, origin)` after the shared store is bumped. A mutation's `run`
  has finished by then, so a refetch reads committed data.

## 6. Client

`live.ts`: one connection per tab, one `Sub` per `fn + input`, refcounted with `keep` (`'30s'` by default, `'session'`
pins). It owns reconnects:

- full-jitter backoff, 0.5 s doubling to 30 s; a clean `b` waits only its `retry`;
- immediately on `online` and on becoming visible; `offline` status while the browser says so;
- closed after 5 min hidden and on `pagehide`, resumed on visible and `pageshow`.

Pokes are debounced (50 ms + 0–250 ms jitter) and coalesced, then go through `cache.invalidate`, so a poke is
exactly a local invalidation: entries with readers refetch through `query`, `share()` keeps unchanged rows, and the
keyed list writes only what changed. Readers stay in place: no Boundary fallback, no re-render.

Dev-only: an ack with no tags is W053.

## 7. Fake transport (`weft/test`)

`transport.rt` under `net`: the real hub, a memory bus, the real client, and frames through JSON. Debounces and jitter
are zero under the fake, so `await net.settle()` is enough. New controls: `net.push(stream, msg)`, `net.poke(...tags)`,
`net.drop()` (cut the connection), `net.reconnects()`, `net.subscriptions()`; `net.offline()` also cuts it.
Subscriptions held by an owner are T012 leaks; a `keep` grace period isn't, because the cache owns it.

## 8. Diagnostics

| Code | Where | Catches |
|---|---|---|
| W051 | run time (thrown) | `stream()` outside an owner; PLAN's code for subscriptions |
| W052 | compiler | `watch` that accumulates a stream into `state` in a component |
| W053 | start (dev), client and hub | `.live()` on a query with no tags |
| R002 | `weft build` (error) | memory bus on a multi-instance preset, in an app using realtime |
| R003 | start (dev) | a mutation wrote a table a live query reads, and their tags don't intersect |
| R004 | start (thrown) | `origins: '*'` |
| R005 | `weft build` (warning) | a stream input with an unbounded string or array |
| R006 | start (dev) | a stream's `run` read the database before it subscribed to a topic |
| R007 | `weft check` | `ws`, `socket.io-client` etc. as dependencies |
| R008 | start | a message over 1 MiB, or a request body over 64 KiB |
| R009 | start | too many subscriptions on a connection, or connections for a user |
| R010 | start | Origin refused on `/_weft/rt` |
| T013 | `weft check` | a real `WebSocket`/`EventSource` in a fast test |

**P007 is taken.** PLAN and research 07 give it to `ws` and friends, but the catalog has used P007 for a bad
`weft.config.ts` since Phase 1 and code depends on that. It becomes R007. R001 stays reserved for `channel` (3b).

## 9. Left ready for Phase 3b

- `Bus` is transport-free: redis, nats and durable-object implement three methods, and `channel` fan-out can use it.
- `/_weft/rt` isn't the WebSocket path; crossws gets its own route, and `channel` has its own client state.
- The hub's origin check and limits are plain functions the upgrade handler can call. `Fn.kind` takes a new kind.

## 10. As built

The design above held. What changed while building it:

- **The poke channel is lazy, and a render waits for it.** A hub subscribes to `weft:poke` on first use, not at boot,
  so `weft build` and a prerender open no bus connection. A page with `.live` awaits `hub().ready()` (at most 250 ms)
  before writing `#weft-rt`, or the first page had no cursor. A failed subscribe drops the channel and the next use
  retries. A publish that fails (bus down) is reported as `E_RT`; the mutation still succeeds.
- **`live.ts` doesn't import `data.ts`.** It gets its bindings through `use(liveApi)`, on `.live`'s first call or in
  `stream.ts`. With that static import, Rolldown kept the dynamic chunk even when the code importing it was
  tree-shaken (a stub `live.ts` importing any one binding from `data.ts` reproduces it): that kept `live`, `exec`, `hub` and `data` as chunks in an app with no queries, and the split raised the
  JS it loaded. `use` is a call inside `stream`, because `sideEffects: false` skips a re-exporting file's statements.
- **The fake link is `live-fake.ts`, behind an opaque specifier.** An `import()` the bundler can see ships the hub to
  `public/`, unreferenced. So `import(/* @vite-ignore */ FAKE)` is only reachable when `DEV && net()`.
- **Sinks take a string.** `Sink.write(event, data)` gets serialized JSON, so one `JSON.stringify` serves every
  subscriber of a message. The fake parses it, which is the round trip §7 wants.
- **The page's cursor is read on first connect, not at import**, so a test (or a late chunk) sees the element.

**Verified.** `scripts/runtime-matrix.mjs` with `scripts/e2e-realtime.mjs`: memory bus 10 checks, Postgres bus 11
checks (PG 16, private instance), each on Node, Bun and Deno, covering the Origin refusal, a poke and a stream across
the wire, resume after a drop, and a NOTIFY from outside the process. Two Chrome tabs: a poke writes exactly one
`characterData` mutation in the other tab, with no re-render and no Boundary fallback.

**Size** (`.output/public/assets`, gzip -9, against ea5a4e7, same app and same `weft` build):

| App | Baseline | Now |
|---|---|---|
| scaffold, no queries, no realtime | 7,923 B, 6 chunks | 7,923 B, identical bytes |
| one query and one mutation, all chunks | 16,356 B | 19,343 B, of which `live` 2,180 B (not loaded) |
| the same, without `exec`, `about` and `live` | 12,814 B | 13,328 B: +514 B |

The realtime client is 2.2 KB gzip on first `.live`. The `live` chunk an app using `stream` loads is 6.6 KB because it
also holds `data.ts`. The +514 B on a query app that never reads `.live` is the method, the status boxes, `liveApi`
and a small `keys` chunk the shared client splits out. It's more than "one line" and it isn't free: a Phase 4 size pass
could move `stale` and `liveApi` behind the import.

**Known gaps.**

- W052 recognises a stream by its import from a server module, so a stream passed through a prop isn't caught.
- R001 is reserved for `channel`. Plugin buses (the `realtime.bus` slot) are 3b.
- One connection per tab: no sharing across tabs (research 07 leaves that to `tabs.channel`).
- `stale` only compares build ids; nothing reloads for you.
- `.live` reached by client navigation (no page cursor) refetches once on ack, by design.
- `weft browser` doesn't show realtime subscriptions.
- `.output/public` still carries the unreferenced `exec` chunk in any app with queries, as it did before this work.
