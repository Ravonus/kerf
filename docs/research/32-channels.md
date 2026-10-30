# 32. Channels: `channel`, `sharedState`, `sync: 'tabs'`, `tabs.channel`, three buses (Phase 3b)

Status: **design written before the code, 2026-10-30; §11 records what was built and measured.** Inputs: PLAN §4.2 and
§4.5, [07](07-realtime-and-events.md) §5 and §9 (the research; this note doesn't repeat it),
[14](14-app-state.md) §2.8 and §3.6, [30](30-realtime.md) (the hub and `Bus` this builds on). Size rule from PLAN: an app
that uses none of this ships none of it.

## 1. Decisions that research 07 and 14 left open

**Nitro hands us hooks through a `Response`.** `resolveWebsocketHooks` runs the app's `fetch` and reads `res.crossws`,
so the upgrade goes through `createHandler` like any request. `/_weft/ws` answers with a 426 carrying the hooks, and
weft needs no Nitro route file. Refusals are `upgrade() { throw new Response(…) }`. The same request object gives the
hooks the session cookie, so `ctx` comes from `context.server.ts` as it does for a query.

**`features.websocket` is on only for apps that define a channel.** It pulls crossws into the server bundle on every
preset, and an app with no `channel` or `sharedState` shouldn't carry it. The check is a scan of server modules, like
`usesLive`.

**Missing `Origin` is refused on the upgrade.** The SSE POST lets it through because the POST + `x-weft` proof carries
the weight. An upgrade has no such proof, and every browser sends `Origin` on one. A client without it is not a browser
the check protects, and it has no reason to reach this route. Scheme and port are exact (research 07 §5). R010 reports
it, as on `/_weft/rt`.

**R004's upgrade check.** `realtime({ origins: ['*'] })` throws already. Added for 3b: a wildcard anywhere in an origin
(`https://*.example.com`), and the same check again at the upgrade, because `realtime()` is a wrapper an app can skip
by exporting a plain object. `weft check` reports the other half research 07 names, "a custom upgrade handler that
skips the Origin check": a source file importing `crossws` or `defineWebSocketHandler`.

**R001 fires three times.** The type makes `authorize` required, `channel()` throws R001 at definition (on the server;
client stubs have nothing to check), and `weft build` fails it from the `weft:start` transform, with a line number,
before anything runs. `authorize: () => true` must be written out.

**`authorize` runs on every join, and again at each session re-check.** It decides per room, and `ctx.user` can change
between reconnects. A refused join is `e` with **R011**, a new code: `authorize` returned false. A join that fails a
later re-check gets the same frame, and the client's status becomes `'unauthorized'`. A connection whose user is gone
closes with 4401. Besides the 5-minute timer, a poke of the tag `session:<userId>` re-checks that user's connections at
once (research 07 §5): `invalidate('session:' + id)` after a sign-out or a kick.

**Resume reuses the hub's rings.** A room is a hub channel named `weft:c:<id>:<stable params>`. `<epoch>:<seq>` cursors,
256 events / 60 s, "ring lives one window after the last listener", the gap signal and the out-of-window `reset` are
all research 30's. Only the wire differs. The join listens first, then replays (R006's rule), so a message published
between the two can't be lost, and a seq already seen is dropped.

**A reset can't be silent, and it can't be hidden in `collect`.** A channel has no fold to restart from `initial`. On
`r`, `collect` empties, `chat.resets` (a box) ticks, and `chat.onReset(fn)` fires, so the app refetches history. The
intended chat shape is a query for history, `channel` for what's new, and `collect('said', { key })` to drop a row
that's in both. The bus is at-most-once and the ring is per instance, so the query is what's durable. The channel is a
wire, not a log.

**`send` has no offline queue** (PLAN §10). While the socket is reconnecting a `send` waits up to 10 s for the join to
come back, then rejects. A `send` in flight when the socket dies rejects at once, because its outcome is unknown and a
retry could double it. Handlers that must be idempotent take an id in the message.

**`ctx` is computed once per connection and at each re-check, and each message gets a fresh scope.** Running
`context()` per message would be a session lookup per keystroke. A fresh `Scope` per message means a query read inside
`on` isn't served from a stale request cache, and a mutation called from `on` works: it invalidates and pokes as usual.

**Validation.** `params` and every client message are always validated, and names are looked up with `Object.hasOwn`
(a message named `constructor` must find nothing). Server messages are validated in dev and tests (C002).

**`sharedState` is a `channel` with one built-in message.** The value lives in the hub of each instance that has a
listener, stamped `(at, instance)`, last writer wins. A new listener on an instance has no value, so it asks on the bus
(`?`), and any instance holding one answers; there's no store to configure. That survives a rolling restart while one
instance lives, and nothing survives every instance going down: the box falls back to `initial`, the value the
definition declares. An `initial` is kept in the client stub, as `shape` is. Persisting across a full restart is the
app's job (a mutation and a query).

**The client box isn't a scope box.** `slide.value = 3` must send, and `Instance` overwrites `box.h`, so the box is a
`Box` subclass overriding `w`, created outside `collect`. It's returned from a setup like any box, with no `persist`
and no `history`, which is what research 14 §3.6 wants. Reading a server echo while a local write is pending keeps the
local value; the last ack settles it, and a rejected write puts back the last server value and sets `.error`.

**`sync: 'tabs'` is its own module.** `weft/sync`, imported by the `weft()` plugin where `sync: 'tabs'` appears, like
`weft/persist`. Research 14 §2.8 says patches per path. `Box.set` gives no patches, so the module diffs top-level keys
of plain objects between the last broadcast and the current value (other values replace whole). That is what "adding
two different products in two tabs merges" needs. Conflicts: last writer by `(at, tab)`, per key. Writes coalesce per
microtask. An incoming write skips the write hook (no echo, no undo step) and asks `persist` to write the merged value,
or tab B's flush would drop what tab A added. The merged value must pass the box's schema, else it's dropped: a tab
from another deploy can't corrupt this one. `sync: 'tabs'` needs `persist` with `local`, `cookie` or `memory`; `session`
or none is S008.

**`tabs.channel` is typed and validated in both directions.** It's in `weft/browser`, one `BroadcastChannel` per name
per document, refcounted, removed with the owner, T012-tracked. A received message that fails the schema is dropped
(another deploy's tab), with a dev warning. On the server it's inert. `.post(msg)`, `.on(fn)`, and `.value`, the last
message received. A browser without `BroadcastChannel` makes `.post` a no-op.

**`tabs.channel` doesn't share a socket across tabs.** PLAN §10 keeps that out of v0.

## 2. API

```ts
// src/server/chat.ts
export const room = channel({
  params: z.object({ roomId: z.string().max(64) }),
  authorize: ({ ctx, params }) => isMember(ctx.user, params.roomId),      // required; each join and each re-check
  client: { say: z.object({ text: z.string().min(1).max(2000) }) },
  server: { said: Message, typing: z.object({ userId: z.string() }) },
  on: { say: async ({ msg, ctx, params, room }) => room.publish('said', await insert(ctx, params.roomId, msg.text)) },
  limits: { perSecond: 10 },
})
await room.in({ roomId }).publish('said', row)                            // from a mutation or a job

// a component or scope
const chat = room.connect(() => ({ roomId: props.roomId }), { keep: '30s' })
const said = chat.collect('said', { max: 200, key: m => m.id })           // Derived<Message[]>, kept in the cache
chat.on('typing', ({ userId }) => show(userId))
await chat.send('say', { text })                                          // resolves on the server's ack
chat.status.value                                                         // 'connecting' | 'open' | 'reconnecting' | 'closed' | 'unauthorized'

// shared state
export const deckSlide = sharedState('deck-slide', { key: z.string(), value: z.number(), initial: 0, authorize: { read, write } })
const slide = deckSlide.connect(() => (id.value ? id.value : skip))       // State<number> & { status, error }

// weft/browser and state
const bus = tabs.channel('cart', z.object({ count: z.number() }))         // .post .on .value
const lines = state<Lines>({}, { persist: { in: 'local', schema, version: 1 }, sync: 'tabs' })
```

## 3. Wire

`GET /_weft/ws`, one socket per tab, JSON arrays. `n` is the client's join number.

| Client → server | |
|---|---|
| `["j", n, id, params, cursor?]` | join (or rejoin with a cursor) |
| `["l", n]` | leave |
| `["m", n, ack, name, msg]` | a message; `ack` is echoed |
| `["p"]` | ping, every 20 s |

| Server → client | |
|---|---|
| `["h", { k, e, b }]` | hello: connection, epoch, build |
| `["j", n, cursor]` | joined; `cursor` is the position to resume from |
| `["m", n, cursor, name, msg]` | a message |
| `["r", n]` | out of the window: what the client holds may have gaps |
| `["a", n, ack, error?]` | the ack of a client message |
| `["e", n, { code, message }]` | a join refused, or lost at a re-check |
| `["p"]` | pong |

Close codes: **4401** the session is gone, **1008** rate limit (R008), **1009** a frame over the cap (R008), **1013** send
queue over `limits.queue`, resume. Anything else is a plain reconnect.

## 4. Server: `socket.ts`

Runtime-free over the hub, like `hub.ts`: `attach(peer-like, request, scope)` returns `message` and `close`, so one code
path runs behind crossws and behind the fake. `socketRoute` is the part that knows crossws, and it's only imported by
`server.tsx`. `runtime.channels` is how `room.in(params).publish` reaches it from a definition that also runs in the
browser.

Limits, in `Limits`: `perSecond: 20`, `burst: 40`, frame cap = `body` (64 KiB), message = `message` (1 MiB), joins share
`subscriptions`, sockets per user share `connections`. No client traffic for 60 s closes the socket (the client pings
every 20 s).

## 5. Client: `channel.ts`

One socket per tab, one `Join` per id + params, refcounted with `keep`. Backoff is `channel.ts`'s own (the same
curve as `live.ts`, so neither module pulls in the other), reconnect is immediate on `online` and visible, the socket closes after 5 min hidden and on `pagehide`, and
45 s of silence is dead. Joins whose last reader left are `l`eft after `keep`. The server-rendered value is inert: `[]`,
`initial`, status `'connecting'`, and a `send` that rejects.

## 6. Buses

All three implement research 30's `Bus` and carry its gap contract: first connect is not a gap, every later one is.

- **`redisBus({ url })`**, `@weft/start/bus/redis`, peer `ioredis`. Two connections (a subscriber can't publish).
  `ready` after the first is the gap. A channel maps 1:1 to a Redis channel, prefix `weft:`.
- **`natsBus({ servers })`**, `@weft/start/bus/nats`, peer `@nats-io/transport-node`. Subjects can't hold `*`, `>` or
  spaces, and channels come from tags and keys, so the subject is `weft.<base64url of the channel>`. A `reconnect` status
  is the gap.
- **`durableObjectBus({ namespace })`**, `@weft/start/bus/durable-object`, with `WeftBusObject`, the class the app
  exports and binds. One object per channel. It has no state of its own beyond its sockets: a publish POSTs to the object,
  which writes to every socket, using the hibernation API (`acceptWebSocket`). A subscribe is a WebSocket to the object;
  a close is the gap, then it reconnects. No platform account: tested on workerd through Miniflare, locally.

**A Worker's I/O belongs to the request that opened it**, so a stub's socket can't outlive one request in a stateless
Worker. `durableObjectBus` therefore needs a hub that lives in a Durable Object: Nitro's `cloudflare_durable` preset,
whose WebSockets run in one. On `cloudflare_module` the build refuses it, as R002.

**R002 now counts channels**: `channel` and `sharedState` definitions are realtime, like a stream.

**`realtime.bus` plugin slot.** Research 30 left plugin-provided buses to 3b. `src/realtime.server.ts` takes any `Bus`,
which is how all three plug in, so the slot adds nothing today. It stays declared, and a real third-party bus decides
what it needs.

## 7. Fake transport (`weft/test`)

`channel-fake.ts`, behind an opaque specifier like `live-fake.ts`: the real `socket.ts` and hub, frames through JSON.
Controls: `net.publish(room, params, name, msg)` (as another user would), `net.sent(room)` (what this client sent),
`net.drop()` and `net.offline()` cut it too, `net.session(ctx)` swaps the context and re-checks now. `tabs` from `weft/test` fakes
`BroadcastChannel`: `tabs.post(name, msg)` as another tab, `tabs.posted(name)`. Two `render()`s are two tabs for
`sync: 'tabs'`: each gets its own `BroadcastChannel`, and a shared `storage` is the shared `localStorage`.

## 8. Diagnostics

| Code | Where | Catches |
|---|---|---|
| R001 | start (thrown), `weft build` | `channel` or `sharedState` without `authorize` |
| R002 | `weft build` | memory bus on a multi-instance preset, now with channels; `durableObjectBus` outside `cloudflare_durable` |
| R004 | start (thrown, and at the upgrade), `weft check` | a wildcard origin; a hand-written upgrade handler |
| R005 | `weft build` (warning) | also a channel's `params`, client messages, shared key and value |
| R008 | start | also an oversized frame, and the rate limit (close 1008) |
| R009 | start | also joins, sockets |
| R010 | start | also a refused upgrade |
| R011 | start | a join `authorize` refused (new) |
| S008 | start | `sync: 'tabs'` without `persist`, or with `session` |
| T012 | `weft/test` | an open join or `tabs.channel` at the end of a test |

W055 (`send` with a wrong payload) stays in research 07's list: TypeScript reports it, and the client has no schema to
check with. R007's fix text moves to `channel`.

## 9. Exit check

`evals/phase3b-exit.mjs`, in the shape of `phase3-exit.mjs`: scaffold, a brief, a fresh agent with no e2e, then `weft
check`, `tsc`, the build, and a hidden e2e on Node, Bun and Deno over a real WebSocket: join, auth refusal, Origin
refusal, R-code checks on the agent's source, send/receive across two users, and a drop + resume.

## 10. Left out

Presence, cross-tab socket sharing and WebTransport (PLAN §10). `geolocation` (research 07 lists it with 3b; PLAN's row
doesn't). A real Cloudflare deploy: the task keeps it local.

## 11. As built (2026-10-30)

The design above held. What changed or was learned:

- **R001 fires in three places:** `channel()` throws at definition, `withIds` fails `weft build` with the line, and
  `weft check` runs the same `withIds`. A definition without `$id` from another package isn't seen statically.
- **R004 also covers a hand-written handler:** `weft check` flags `crossws` imports and `defineWebSocketHandler`.
- **`definesFns` and `fnExports` were narrower than they looked.** `sharedState`'s definition is the second argument, and
  `topic(name, def)` also has one, so the object is found by kind, not by "the first object" (that stubbed topics into
  the client). Q003's filter had to learn the new names.
- **A refused upgrade is a `crossws.upgrade` that throws a Response.** Nitro runs the app's fetch and reads `res.crossws`,
  so the route answers with hooks; 426 for a plain GET comes from the same route.
- **Rate limits close nothing:** over `perSecond` a message is refused (R008) and the socket stays.
- **A frame's size is checked after receipt** (R008, 1009): Nitro passes no `maxPayload` to `ws`. The bytes are read, not
  parsed or kept. This is the one limit weaker than the design.
- **`sharedState` values live in instance memory.** A later join asks the bus (`$?`) and any instance answers. With no
  instance left the value is `initial`. A value that must last is a mutation.
- **The Durable Object bus needs `cloudflare_durable`:** a Worker's socket belongs to the request that opened it, so a
  stateless hub can't hold it. `busProblem` refuses the others (R002). Only workerd via Miniflare has run it.
- **Size:** channel code sits behind `/_weft/ws` and `features.sync` in `weft/sync`, reached only through the `weft()`
  FEATURES filter. A scaffold's client bundle is byte-identical to before; the server output grew 17.5 KB.
