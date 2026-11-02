# 07 — Real-time and browser events: live queries, streams, channels, reactive browser values

Research date: 2026-10-28. Versions come from `npm view` on that date unless a source is cited. Statements marked
**(unverified)** could not be confirmed from a primary source.

**The ask (from the user):**
- Real-time communication and browser events built in, not bolted on.
- Very strict TypeScript, and one schema from the database to the form, including defaults.
- Agents are the primary users, so misuse is a compile error with a fix, not a silent bug.

**The sketch under review:** `listTodos.live(args)` driven by cache tags · `stream()` over SSE · `channel()` over
WebSocket · browser events as reactive values · strict transport defaults · Drizzle → Zod → server fn → client → form.

---

## TL;DR

1. **The sketch is right. Two changes make it much better:**
   - **Subscriptions belong to the client cache, keyed by `fnId + args`, not to the component.** Components hold a
     refcounted reference. This kills the v3 planted bug ("subscription opened in `CartView`") structurally: unmounting
     the tab no longer drops the subscription or its folded state for a grace period, and a remount reuses it.
     SvelteKit's `query.live` already shares one connection across instances the same way.
   - **`.live` should be invalidation-based ("poke + refetch"), not diff-based, in v0.** A poke carries only tag
     names. The refetch goes through the normal `query` path, so per-user authorization, the tagged server cache,
     single-flight and HTTP caching all apply unchanged. No new authorization model is needed.
2. **Transports.** SSE (over HTTP/2) for everything server→client: `.live` and `stream()`. WebSocket only for
   `channel()`, where the client also sends a stream of messages. WebTransport became Baseline "newly available" in
   March 2026, but server, proxy and CDN support is thin. It is not a v0 transport.
3. **One SSE connection per tab, multiplexed.** Per-subscription `EventSource`s hit the 6-connection HTTP/1.1 cap
   (Vite dev without TLS is HTTP/1.1), and the cap is per browser, not per tab.
4. **Serverless forces reconnects, so resume is not optional.** Vercel WebSockets and SSE close at the function's max
   duration (300 s default, 800 s max). Every stream needs ids, a server ring buffer and a "too far behind → reset to
   snapshot" path. `.live` gets the reset for free: refetch.
5. **Fan-out:** the zero-infra default is an in-process bus. It is only valid on single-instance targets, and that is
   checked at build time. Upgrade path: **Postgres `LISTEN/NOTIFY`** (the database you already have; pokes are tiny),
   then Redis or NATS, then a Durable Object hub on Cloudflare. Nitro/crossws `publish` is per-instance only.
6. **Security defaults:** an Origin allowlist on every WebSocket upgrade (three 2026 CVEs were exactly this, and
   `SameSite=Lax` did not save them), a required `authorize` on every channel, schema-bounded message sizes, rate
   limits, and session re-checks on long-lived connections.
7. **Browser values** (`online`, `visible`, `media`, `storage`, `lifecycle`, `tabs.channel`, `on`, `interval`) are
   `Derived`/`State` boxes with one shared, refcounted listener per document. Each takes an explicit SSR value, because
   hydration mismatch is the main pitfall of VueUse and solid-primitives.
8. **Don't build a sync engine.** Zero 1.0 (stable since 2026-03-24, now 1.11.3), Electric and TanStack DB (0.15.2,
   still 0.x) are the references for later, as adapters. PLAN §10 already rules out local-first for v0.

---

## 1. Transports in 2026

| | SSE | WebSocket | WebTransport |
|---|---|---|---|
| **Direction** | server→client. Client→server is a normal POST | both | both, streams and datagrams |
| **Browser support** | universal | universal | Baseline *newly available* since Safari 26.4 (March 2026). Chrome and Safari still send the legacy `:protocol` value **(unverified, secondary sources)** |
| **HTTP version** | HTTP/1.1 (6 connections per browser per origin) or HTTP/2/3 (multiplexed, usually ~100 streams) | its own TCP connection (HTTP/1.1 Upgrade). RFC 8441 over h2 is rarely deployed **(unverified)** | HTTP/3 (QUIC) only |
| **Proxies and CDNs** | plain HTTP. Breaks when buffered (nginx `proxy_buffering`, gzip). Needs a comment heartbeat every 15–30 s | needs Upgrade support end to end. Most CDNs have it now | thin. Node has no stable HTTP/3 server **(unverified)** |
| **Auth** | cookies (same-origin `EventSource` sends them). `EventSource` can't set headers; a fetch-based reader can | cookies on the handshake only. Browsers can't set headers on `new WebSocket`. **Origin check is mandatory** (§5) | cookies or a token in the first stream |
| **Resume** | built in: `id:` + `Last-Event-ID` + `retry:` | none; the application owns it | none |
| **Serverless** | works wherever streaming responses work | needs platform support (below) | no |

**Platform support for Nitro v3 (`nitro@3.0.260903-beta`, h3 2.0.8, crossws 0.4.17):**

- **WebSocket:** `features: { websocket: true }` plus `defineWebSocketHandler({ upgrade, open, message, close, error })`.
  It runs on Node, Bun, Deno, Vercel and Cloudflare Workers. Cloudflare pub/sub needs a Durable Object.
- **`upgrade(request)`** can return `context`, `namespace` or `headers`, or **throw a `Response` to reject**. This is
  where weft does its Origin and session checks.
- **Pub/sub:** `peer.subscribe/publish` is namespaced by URL path, excludes the publisher, and is **in-process only**.
- **SSE:** `createEventStream(event)` with `push({ id, event, retry, data })` and `onClosed`.
- **Vercel:** WebSocket entered public beta on 2026-06-22 on Fluid Compute. A connection is pinned to its instance
  and closes at max duration: Hobby 300 s, Pro 300 s default and up to 800 s, 1,800 s in beta. Vercel's own page warns
  that `server.publish()` only reaches sockets on the same instance and recommends Redis.
- **Cloudflare Durable Objects:** the hibernation API keeps sockets open while the object is evicted, up to 32,768
  sockets per object. `serializeAttachment` holds 2 KB per socket. The message limit was raised to 32 MiB in October 2025
  **(unverified, secondary sources)**.

**Verdict:**
- **SSE is the default** for `.live` and `stream`. That matches the industry: tRPC v11 recommends SSE
  (`httpSubscriptionLink`) for subscriptions, and Nitro's own docs pitch SSE's built-in reconnection.
- **WebSocket is used only for `channel()`.**
- **Implement SSE as a fetch-based reader, not `EventSource`.** It can POST the subscription set as a body, send
  headers, and parse the stream itself. weft implements `Last-Event-ID` itself (the protocol is trivial).
- **Server side:** disable compression for `text/event-stream`, send `X-Accel-Buffering: no` and `Cache-Control:
  no-store`, and send a `: ping` comment every 20 s.
- **bfcache:** Chrome 148 closes open WebSockets on bfcache entry instead of making the page ineligible. Older
  guidance (MDN) is to close in `pagehide` and reopen in `pageshow`. weft's runtime does that anyway, through
  `lifecycle` (§6).

Sources: https://nitro.build/docs/websocket · https://vercel.com/support/articles/do-vercel-serverless-functions-support-websocket-connections ·
https://developers.cloudflare.com/durable-objects/api/websockets · https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready ·
https://oneuptime.com/blog/post/2025-12-16-server-sent-events-nginx/view · https://groups.google.com/a/chromium.org/g/blink-dev/c/52nlr8z3Png ·
https://developer.mozilla.org/en/docs/websockets/writing_websocket_client_applications

---

## 2. Prior art: live queries and typed real-time APIs

| System | Model | Transport | What weft takes |
|---|---|---|---|
| **SvelteKit `query.live`** (3.1.0, experimental) | Async generator on the server. The client value is self-updating (no `refresh()`), with `.connected` and `.reconnect()`. Instances **share one connection**; the last reader leaving stops server iteration. Backpressure keeps only the latest value: "live streams are not event logs". A mutation can call `getX(args).reconnect()` in the same flight. Backoff, plus an immediate reconnect on `online` | not documented | **Closest API reference.** Copy shared connections, latest-value backpressure, mutation-triggered refresh in the same flight, and the `online` trigger. |
| **tRPC v11** (11.19.0) | `subscription` procedure as an async generator. `tracked(id, data)` gives resumable ids, and `lastEventId` arrives through `input`. Pitfall in the docs: **subscribe to the bus before reading the backlog**, or events are lost in the gap | SSE (recommended) or WS | Resume via typed `lastEventId`; listener-before-backlog as a rule inside weft, not a user concern. |
| **oRPC** (1.16.1) | Event iterators. `withEventMeta({ id, retry })` | SSE | Same. Note: plain `EventSource` can't see oRPC's completion signal and reconnects forever, which is another reason to own the client reader. |
| **Convex** (1.48.0) | The server records each query's **read set**. A commit that overlaps it reruns the query and pushes the result, and all subscriptions update to one consistent snapshot | WS | The ideal, but it needs to own the database. weft's explicit tags are the cheap approximation, and the dev tag check (PLAN §4) shrinks the gap. |
| **Zero** (Rocicorp, 1.0 on 2026-03-24, now 1.11.3) | Sync engine: client-side ZQL over a replicated subset, server-authoritative mutators, permissions in the database (deny by default since 0.15) | WS | Later adapter. Heavy: 232 KB gz client and no SSR, per InfoQ. |
| **ElectricSQL** (client 1.5.28) + **TanStack DB** (0.15.2) | Shapes over **plain HTTP long-poll (or SSE)**, CDN-cacheable with a cursor param. TanStack DB adds client collections with differential-dataflow live queries and optimistic transactions. Electric is "public by default": put it behind an auth proxy | HTTP/SSE | Proof that HTTP-first live data scales through CDNs. Later adapter, as PLAN §10 says. |
| **Supabase Realtime** (realtime-js 2.118) | "Postgres Changes" checks RLS **per change per subscriber** (100 subscribers = 100 reads) on a single thread. Supabase now recommends **Broadcast from a trigger** instead | WS | The cautionary tale for diff-based per-row pushes: authorization cost scales with subscribers × writes. |
| **Liveblocks / PartyKit** (partyserver 0.5.10) | One room = one Durable Object. Presence, storage, broadcast | WS | Shape of `channel()` rooms and the Cloudflare upgrade path. |
| **Phoenix Channels / LiveView** | Topics with `join/3` authorization; LiveView sends rendered diffs. Long-poll fallback **(unverified for current defaults)** | WS | **`join` = required `authorize`.** Topic strings with params. |
| **Meteor** | Poll-and-diff costs O(N²) CPU and bandwidth in users. Oplog tailing reads every write in the database | DDP/WS | Why diff-based server state is expensive. Dedupe identical queries, which weft gets from the shared cache key. |
| **Hotwire Turbo 8** | `broadcasts_refreshes`: the server sends "refresh", the client refetches and morphs, and **bursts are debounced to the last one** | ActionCable WS | **Exactly the poke + refetch model, in production at 37signals.** Copy the debounce. |

### Invalidation vs diff vs sync engine: what each costs

| | Invalidation (poke + refetch) | Server diff (push new result) | Sync engine |
|---|---|---|---|
| **Per write** | 1 small message per subscriber, then one refetch per subscribed client. **Shared-scope cached queries make every refetch after the first a cache hit** | rerun the query once per distinct key, and re-authorize per subscriber (the Supabase problem) | replicate rows, run client-side incremental view maintenance |
| **Server memory** | the subscriptions (tag → connections) and a small ring buffer | last result per subscription, to diff against | replica + per-client state (CVR) |
| **Authorization** | **unchanged**: the refetch is a normal `query` call with `ctx.user` | must be re-evaluated per push | a separate permission system |
| **Freshness bug surface** | missing tags (dev-checked) | same, plus diff and merge bugs | schema drift, conflict resolution |
| **Infra** | none extra | none extra | separate service (zero-cache, Electric) |
| **Fit for an explicit-tag cache** | **native**: `invalidates` already exists | needs per-query result storage | replaces the cache |

**Verdict for v0: invalidation.** It reuses every piece weft already plans (tags, single-flight, `Resource`, the
server tagged cache). It is how Turbo 8 works, and the refetch herd is bounded by debouncing and the shared cache.
- **Phase-later cheap upgrade:** for `scope: 'shared'` queries, the server can attach the freshly computed value to
  the poke. That is the same payload shape as a single-flight response, so it is a diff-like latency win with no new
  machinery.

Sources: https://svelte.dev/docs/kit/remote-functions · https://trpc.io/docs/server/subscriptions ·
https://orpc.dev/docs/event-iterator · https://docs.convex.dev/understanding/overview · https://infoq.com/news/2026/06/zero-version-1 ·
https://zero.rocicorp.dev/docs/release-notes/1.0 · https://electric-sql.com/docs/api/http · https://tanstack.com/db/latest/docs ·
https://supabase.com/docs/guides/realtime/subscribing-to-database-changes · https://supabase.com/docs/guides/realtime/benchmarks ·
https://blog.meteor.com/tuning-meteor-mongo-livedata-for-scalability-59327a144a9 ·
https://rubydoc.info/github/hotwired/turbo-rails/main/Turbo/Broadcastable · https://dev.37signals.com/a-happier-happy-path-in-turbo-with-morphing/

---

## 3. Multi-instance fan-out

| Bus | Cost | Limits | Use |
|---|---|---|---|
| **In-process** (Nitro `peer.publish`, an `EventEmitter`) | zero | one process only. Vercel, Lambda and Netlify scale out silently | dev, a single Node/Bun box |
| **Postgres `LISTEN/NOTIFY`** | zero new infra: Drizzle's database | payload < 8,000 bytes; one database; a **global lock at commit** (DBOS measured 2.9K notifies/s naive, 60K/s tuned); the queue is 8 GB and a full queue fails commits. Needs a dedicated, non-pooled connection (pgBouncer transaction mode breaks `LISTEN`) | **default for multi-instance.** Pokes are tag names, far under 8 KB |
| **Redis pub/sub** (ioredis 6.0.0) | a Redis | at-most-once, no replay (Streams if replay is needed) | high fan-out. Vercel's own recommendation |
| **NATS** (`@nats-io/*` 3.4) | a NATS server | JetStream for replay | large or multi-region deployments |
| **Cloudflare Durable Object** | the platform | one object per topic or room is the scaling unit | the Cloudflare preset's hub for `channel()` and the `.live` registry |
| **unstorage** (2.0.0-beta.0) | — | a KV store, not a bus. `watch` is driver-dependent **(unverified per driver)** | don't use it for fan-out |

**Default:** `realtime.bus: 'memory'`. **`weft build` refuses it** on presets that run more than one instance
(Vercel, Netlify, Lambda, Cloudflare without a DO binding) with R002. The fix line names `'postgres'` when the db
adapter is Postgres, otherwise `'redis'`. So the upgrade path is one config line:
`memory → postgres → redis | nats | durable-object`.

**Replay lives in weft, not the bus.** Each instance keeps a per-topic ring buffer (default 256 events or 60 s).
Sequence ids are `<epoch>:<seq>`, where the epoch is the instance boot id. A resume that crosses an epoch, or falls
outside the buffer, gets `reset`:
- `.live` refetches,
- a `stream` restarts with `lastEventId: undefined`, and its handler decides whether to replay from the database.

Sources: https://www.postgresql.org/docs/current/sql-notify.html · https://dbos.dev/blog/postgres-listen-notify-scalability ·
https://vercel.com/support/articles/do-vercel-serverless-functions-support-websocket-connections · https://nitro.build/docs/websocket

---

## 4. Reliability

- **Reconnect:**
  - exponential backoff with full jitter, 500 ms → 30 s cap;
  - immediate on `online` (as SvelteKit does) and when the page becomes visible;
  - the server's `retry:` overrides it;
  - while `hidden` for more than 5 minutes, SSE is paused (the server keeps no state; resume handles it).
- **Resume:** SSE ids per topic, sent back as a cursor map in the POST body (not one `Last-Event-ID` for a multiplexed
  stream). tRPC's rule is built in: **register the bus listener before reading the backlog**, and dedupe by seq.
- **Ordering:** per topic only, by seq. Nothing is promised across topics. Convex's cross-query snapshot consistency is
  out of scope.
- **Backpressure:**
  - `.live`: pokes are idempotent, so the server coalesces by tag and the client debounces refetches (50 ms default,
    plus 0–250 ms jitter to spread the herd);
  - `stream`: latest-value by default (SvelteKit). `buffer: n` is opt-in;
  - an overflowing server queue (1 MiB per connection) sends `reset` and closes, instead of growing memory.
- **Serverless max duration:** the server ends the stream about 10 s before the platform limit, with `retry: 0`. The
  client resumes from its cursors. The user sees nothing.
- **Mutations while offline:** v0 fails fast with a typed `OfflineError`; `online()` lets the UI disable the button.
  An offline mutation queue needs idempotency keys and conflict rules, so it waits (§9).
- **Multi-tab:** v0 uses one SSE per tab, which is fine on HTTP/2. Later: elect one leader per origin with Web Locks
  (`navigator.locks.request('weft-rt', …)`), have the leader hold the connection, and relay over `BroadcastChannel`.
  - SharedWorker is not the primitive: on Android it only returns with Chrome 148, and Chrome warns it may be killed
    on backgrounding **(stable rollout unverified)**.
  - Leader handoff needs resume anyway, and resume already exists.

Sources: https://svelte.dev/docs/kit/remote-functions · https://trpc.io/docs/server/subscriptions ·
https://groups.google.com/a/chromium.org/g/blink-dev/c/pS1PDOa69CU · https://www.notebookcheck.net/Chrome-148-Beta-for-Android-adds-Web-Serial-SharedWorker-support.1269721.0.html

---

## 5. Security

- **CSWSH:**
  - In 2026 alone, Dozzle (CVE-2026-44985), nginx-ui (CVE-2026-34403) and Grackle (GHSA-w3hv-x4fp-6h6j) shipped
    WebSocket upgrades that checked auth but not Origin. `SameSite=Lax` doesn't help, because it is site-scoped and
    sibling subdomains count as same-site.
  - **weft rejects every upgrade whose `Origin` isn't in `realtime.origins`.** The default is the app's own origin;
    scheme and port are compared too (the HTTP.jl fix).
  - The same check applies to the SSE POST. It already has CSRF protection as a POST.
- **Auth:** cookie session (Better Auth) at connect gives `ctx.user`. Long-lived connections re-check the session
  every 5 minutes, and immediately when the `session:<id>` tag is invalidated (sign-out, revoke). On failure: WS close
  code `4401`, or an SSE `event: auth`. The client refreshes the session over HTTP and reconnects. Serverless max
  duration re-authenticates for free.
- **Topic authorization:**
  - `channel` requires `authorize({ ctx, params })`, Phoenix `join`-style, and it runs on every (re)connect.
  - `.live` needs nothing new: a poke carries only tag names the client could derive from its own args, and data
    only flows through the authorized refetch.
  - `scope: 'user'` live queries require a non-null `ctx.user` to subscribe.
- **DoS limits:**
  - per-message size cap from the schema, plus a hard transport cap (64 KiB);
  - per-connection token bucket;
  - max subscriptions per connection, and connections per user;
  - server-side idle timeout.
  - Client→server schemas without bounds (`z.string()` with no `.max()`, arrays with no `.max()`) get diagnostic R005.

Sources: https://blog.includesecurity.com/2025/04/cross-site-websocket-hijacking-exploitation-in-2025/ ·
https://advisories.gitlab.com/golang/github.com/amir20/dozzle/CVE-2026-44985/ · https://cvefeed.io/vuln/detail/CVE-2026-34403 ·
https://advisories.gitlab.com/npm/@grackle-ai/server/GHSA-w3hv-x4fp-6h6j/ · https://osv.dev/vulnerability/JLSEC-2026-614

---

## 6. Browser primitives: references and pitfalls

The reference libraries are **solid-primitives** (`event-listener` 2.4.6, `media` 2.3.6, `storage` 4.4.0) and
**VueUse** (15.0.0). These are the ones that matter, mapped to weft names:

| weft | solid-primitives / VueUse | Note |
|---|---|---|
| `on(target, type, fn)` | `makeEventListener` / `useEventListener` | typed by `type` from the target's event map; owner removes it |
| `online()` | `createConnectivitySignal` / `useOnline` | `navigator.onLine` is optimistic: `true` means "a network", not "the server". Pair it with transport status |
| `visible()` | `createPageVisibility` / `useDocumentVisibility` | |
| `lifecycle()` | — / — | `active · passive · hidden · frozen · terminated` from `visibilitychange` + `pagehide/pageshow` + `freeze/resume`. Never `unload` |
| `media(q)` | `createMediaQuery` / `useMediaQuery` | **SSR value required.** VueUse added `ssrWidth` / `provideSSRWidth` because a guessed value caused hydration mismatches |
| `storage(key, schema)` | `makePersisted` / `useStorage` | VueUse infers the serializer from the default's type, which silently mis-parses. weft uses the schema. The `storage` event fires only in *other* tabs |
| `tabs.channel(name, schema)` | `makeBroadcastChannel` / `useBroadcastChannel` | structured clone with no validation; weft validates |
| `geolocation()` | `createGeolocation` / `useGeolocation` | prompts. Only on an explicit `.request()`, never at mount |
| battery | `createBattery`(?) / `useBattery` | **skip:** Chromium-only API **(unverified current status)** |

**Pitfalls to design out:**
1. **Hydration mismatch.** The server can't know `matchMedia`, `localStorage` or `onLine`. weft renders the declared
   SSR value during hydration and switches to the real value in the first post-hydration flush. A missing `ssr:` in an
   SSR graph is W054.
2. **One listener per call.** Fifty components reading `online()` must not add fifty listeners. Use one refcounted
   listener per (target, type) per document.
3. **Listeners that outlive their owner.** Both libraries rely on the framework's cleanup hook. weft makes it the only
   path: these APIs throw in dev outside an owner (W051).
4. **`storage` holding invalid data** from an older app version. Parse with the schema; on failure, fall back to the
   schema default, emit a dev warning, and overwrite on the next write.

Sources: https://github.com/solidjs-community/solid-primitives · https://vueuse.org/core/useMediaQuery/ ·
https://developer.chrome.com/docs/web-platform/page-lifecycle-api **(not re-fetched for this doc)**

---

## 7. One schema chain, including defaults

`Drizzle table → schemas.<table>.{select,insert,update}` comes from `drizzle-orm/zod` (1.0.0-rc.5) or `drizzle-zod`
(0.8.3; `drizzle-orm` latest is 0.45.4). From there:
`→ query/mutation/stream/channel input → output → client types → <Form of={…}> initial values`.

**Zod 4 behavior that matters here (zod 4.6.7):**
- `.default(v)` **short-circuits on `undefined` and returns `v` without parsing it**, so `v` must match the *output*
  type. `.prefault(v)` parses it.
- A defaulted field is **optional in `z.input` and required in `z.output`**.

**Consequences:**
- **Client call types use `z.input`** (defaulted fields may be omitted), and **`run` receives `z.output`** (always
  present). The form's initial state is `schema.parse({})` restricted to defaulted keys, typed `Partial<z.input>`. The
  form and the server agree on defaults because they're the same object.
- **Validation:**
  - Input is always validated on the server: call args, `stream` input, and every client→server `channel` message.
  - Output is validated in dev and tests only: query results, `stream` yields, server→client `channel` messages.
  - The client doesn't re-validate server pushes in prod.
- **Version skew.** A long-lived tab can talk to a newer deploy. The connect handshake carries a schema hash. On
  mismatch the server sends `event: stale`, and the client exposes it as `app.stale` (a `Derived<boolean>`) so the UI
  can offer a reload. That is better than parsing failures deep in a component.
- **Dates and BigInt** cross the wire via Zod 4 codecs (PLAN 02 §3), so `z.date()` stays a `Date` in `.value`.

Sources: https://zod.dev/v4 · https://app.unpkg.com/zod@4.6.7/files/src/v4/classic/tests/default.test.ts · https://orm.drizzle.team/docs/zod

---

## 8. Testing (`weft test`, `weft browser`)

- **Fake transport, same protocol.** `@weft-js/core/test` swaps the network layer for an in-memory pair that speaks weft's
  real-time protocol. There are no sockets in the fast lane: a real `WebSocket` or `EventSource` there is T013.
  ```ts
  const app = render(<Todos />, { server })        // server = in-memory weft/start handlers + memory bus
  await server.call(addTodo, { title: 'x' })        // runs the real mutation; its tags poke subscribers
  flush(); expect(getByRole('listitem', { name: 'x' })).toBeVisible()
  server.push(prices, { symbol: 'A', price: 2 })    // typed by the stream's message schema
  net.offline(); clock.advance('31s'); net.online() // backoff and reconnect run on the deterministic clock
  expect(server.reconnects(prices)).toBe(1)
  ```
- **The clock owns** heartbeats, backoff, debounce, ring-buffer TTL and `interval()`, so there are no real timers
  (T004 already bans them).
- **Leak check is automatic.** After each test, weft unmounts and asserts zero live subscriptions, listeners and
  intervals (T012). This is the test-time twin of owner scoping.
- **Browser lane:** MSW 3.0.3 has first-class `ws` and `sse` namespaces. weft's fake server can sit behind them, so
  Vitest Browser Mode uses the same `server.push` API.
- **`weft browser`** adds:
  - `push <stream|tag> <json>` (a poke or a message),
  - `net offline|online|drop|latency <ms>`,
  - `time advance` (already planned).
  - `snapshot` lists open subscriptions with owner names (`CartView → prices{symbols:[…]} refs=1 keep=30s`).

Sources: https://mswjs.io/docs/websocket/ · https://mswjs.io/docs/sse/ · [05](05-testing-browser-cli.md)

---

## 9. Recommendation for weft

### 9.1 API shapes

**Live queries.** These need no new server code: tags are the contract.

```ts
// server/todos.ts  (unchanged from PLAN §4, except tags may be a function of input)
export const listTodos = query({
  input: z.object({ listId: z.string().uuid(), done: z.boolean().default(false) }),
  cache: { life: 'minutes', tags: ({ listId }) => ['todos', `list:${listId}`] },
  run: ({ input, ctx }) => ctx.db.select().from(todos).where(/* … */),
})
export const addTodo = mutation({
  input: schemas.todos.insert.pick({ title: true, listId: true }),
  invalidates: (input) => [`list:${input.listId}`],    // also poked to every live subscriber of that tag
  run: ({ input, ctx }) => ctx.db.insert(todos).values({ ...input, userId: ctx.user!.id }),
})

// client
const todos = listTodos.live({ listId: props.listId })  // Resource<Todo[]> & { live: Derived<LiveStatus> }
// args are tracked: when props.listId changes, it resubscribes. `done` is optional (z.input).
// todos.value · todos.pending · todos.error · todos.live.value: 'connecting' | 'live' | 'reconnecting' | 'offline'
```

**Typed server topics** are the one bus abstraction. Mutations, jobs and webhooks publish to them; streams read them.

```ts
// server/prices.ts
export const priceTopic = topic('prices', {
  key: z.string(),                                     // topic partition (symbol)
  message: z.object({ symbol: z.string(), price: z.number(), at: z.date() }),
})
// anywhere on the server:  await priceTopic.publish('AAPL', { symbol: 'AAPL', price, at: new Date() })

export const prices = stream({
  input: z.object({ symbols: z.array(z.string().max(12)).max(50) }),
  message: priceTopic.message,
  async *run({ input, ctx, signal, lastEventId }) {     // lastEventId is typed and resume is built in
    yield* priceTopic.subscribe(input.symbols, { signal, after: lastEventId })
  },
})

// client: the latest value by default (SvelteKit semantics)
const tick = prices({ symbols: ['AAPL'] })               // Stream<Price>: .value: Price | undefined, .status
// folds live in the client cache entry, not the component. This is the fix for the v3 bug:
const board = prices({ symbols }, {
  fold: (acc: Record<string, { price: number; dir: 'up' | 'down' | 'same' }>, m) => ({
    ...acc, [m.symbol]: { price: m.price, dir: dir(acc[m.symbol]?.price, m.price) },
  }),
  initial: {},
  keep: '30s',                                          // grace after the last reader unmounts; 'session' to pin
})                                                      // Derived<Record<…>>
```

**Channels.** Named messages each way are easier for agents than one union schema, and they give typed `send`.

```ts
// server/chat.ts
export const room = channel({
  params: z.object({ roomId: z.string().uuid() }),
  authorize: ({ ctx, params }) => isMember(ctx.user, params.roomId),   // required (R001); runs on every (re)connect
  client: {                                                             // client → server, always validated
    say: z.object({ text: z.string().min(1).max(2000) }),
    typing: z.object({}),
  },
  server: {                                                             // server → client, validated in dev/test
    said: schemas.messages.select,
    typing: z.object({ userId: z.string() }),
  },
  on: {
    say: async ({ msg, ctx, params, room }) => {
      const row = await insertMessage(ctx, params.roomId, msg.text)
      room.publish('said', row)                                         // fans out through the configured bus
    },
    typing: ({ ctx, room }) => room.publish('typing', { userId: ctx.user!.id }, { exceptSelf: true }),
  },
  limits: { perSecond: 10 },                                            // overrides the defaults table
})

// client
const chat = room.connect({ roomId: props.roomId })      // owner-scoped, shared by key, reconnects + resumes
const messages = chat.collect('said', { max: 200 })     // Derived<Message[]>, bounded, kept in the cache entry
chat.on('typing', ({ userId }) => showTyping(userId))   // removed with the owner
await chat.send('say', { text: draft.value })           // typed by the schema; resolves on server ack
// chat.status.value: 'connecting' | 'open' | 'reconnecting' | 'closed' | 'unauthorized'
```

**Browser values.** Each is called in setup, shares one listener per document, and is removed with its owner.

```ts
import { online, visible, lifecycle, media, storage, tabs, on, interval } from '@weft-js/core/browser'

const isOnline = online()                                        // Derived<boolean>, ssr: true
const dark = media('(prefers-color-scheme: dark)', { ssr: false }) // Derived<boolean>; ssr is required in SSR graphs
const page = lifecycle()                                         // Derived<'active'|'passive'|'hidden'|'frozen'|'terminated'>
const prefs = storage('prefs', z.object({                       // State<{ density: …; lastTab: … }>
  density: z.enum(['compact', 'cozy']).default('cozy'),
  lastTab: z.string().default('home'),
}))                                                              // defaults from the schema; synced across tabs
const cartBus = tabs.channel('cart', z.object({ count: z.number().int() }))  // BroadcastChannel, validated
on(window, 'keydown', e => { if (e.key === 'Escape') close() })  // e: KeyboardEvent, inferred from the type
interval('1s', () => now.value = Date.now())                    // weft clock; paused while frozen
const pos = geolocation()                                        // Resource<GeolocationPosition>; prompts on pos.request()
```

### 9.2 Defaults

| Setting | Default | Notes |
|---|---|---|
| Transport for `.live`, `stream` | one fetch-based SSE per tab, multiplexed | `POST /_weft/rt` with the topic set and cursors; reopened (debounced 50 ms) when the set changes |
| Transport for `channel` | one WebSocket per tab, multiplexed by channel and params | crossws |
| Heartbeat | SSE `: ping` / WS app-level ping every 20 s; dead after 45 s without traffic | browsers can't send WS ping frames |
| Reconnect | full-jitter backoff 0.5 s → 30 s; immediate on `online` and visible | server `retry:` wins |
| Resume | per-topic `<epoch>:<seq>`; ring buffer of 256 events or 60 s | outside the window: `reset` |
| Live refetch | debounce 50 ms + 0–250 ms jitter; coalesced by tag | |
| Stream backpressure | latest value; `buffer: n` opt-in | |
| Subscription lifetime | refcounted per `fnId+args`; `keep: '30s'` after the last reader | `'session'` pins it |
| Max message | from the schema; hard cap 64 KiB client→server, 1 MiB server→client | |
| Rate limit | 20 msg/s, burst 40, per connection; over the limit → close `1008` | per channel `limits` |
| Subscriptions | 100 per connection; 10 connections per user | |
| Server send queue | 1 MiB per connection, then `reset` + close | |
| Origin | own origin only, scheme and port exact | `realtime.origins` |
| Session re-check | every 5 min, and on the `session:<id>` tag | `4401` → refresh → reconnect |
| Serverless | end streams 10 s before the platform's max duration | |
| Validation | input/client→server always; output/server→client in dev and tests | schema hash checked at connect |
| Bus | `memory`; build error on multi-instance presets | `postgres` → `redis` / `nats` / `durable-object` |
| bfcache | close on `pagehide`, resume on `pageshow` | |
| Hidden tab | SSE paused after 5 min hidden | resumes from cursors |

### 9.3 Proposed diagnostics

Compiler (W), server/build (R, new prefix for real-time), tests (T), project (P):

- **W050** raw `new WebSocket` / `new EventSource` / `addEventListener` / `setInterval` in a component with no
  cleanup → use `channel`, `on`, `interval` (autofix for `on`, `interval`).
- **W051** subscription or browser value created outside an owner (module scope, after `await`, inside `setTimeout`)
  → create it in setup, or wrap it in an explicit `root()`.
- **W052** stream fold or `collect` done by hand (`stream.on(m => list.set(d => d.push(m)))`) in a component that
  `weft check` sees mounted conditionally → use `fold` / `collect` with `keep`, or hoist to the route owner.
- **W053** `.live()` on a query with no `cache.tags` → add tags (the fix lists tables touched in dev).
- **W054** browser value read in an SSR-rendered component without `ssr:` → pass the server value.
- **W055** `channel.send` / `topic.publish` payload doesn't match the schema (mapped from TS) → fix the shape the
  message names.
- **W056** `watch` that copies a stream or live value into `state` → read `.value` directly, or use `fold`.
- **R001** `channel` without `authorize` → add it (`() => true` must be written explicitly).
- **R002** `realtime.bus: 'memory'` on a multi-instance preset → `'postgres'` or `'redis'`.
- **R003** a mutation writes a table a live query reads, and their tags don't intersect (dev instrumentation) → add
  the tag.
- **R004** `realtime.origins: '*'`, or a custom upgrade handler that skips the Origin check → list the origins.
- **R005** unbounded client→server schema (string or array without `.max`) → add a bound.
- **R006** `stream` handler that reads a backlog before subscribing (the tRPC gap) → use `topic.subscribe({ after })`.
- **T012** test ends with open subscriptions, listeners or intervals → unmount, or fix the leak.
- **T013** real `WebSocket` / `EventSource` / network in the fast lane → use `server` from `@weft-js/core/test`.
- **P007** app depends on `ws`, `socket.io-client`, `reconnecting-websocket` or `@microsoft/fetch-event-source`
  → use `channel` / `stream`.

### 9.4 Phases (mapped to PLAN §9)

| Phase | Adds |
|---|---|
| **1. Core** | `@weft-js/core/browser`: `on`, `interval`, `online`, `visible`, `lifecycle`, `media`, `storage`. Shared refcounted listeners. W050, W051, W054, W056, T012. These need no server and directly target the v3 bug class |
| **1b. Verify loop** | `weft browser net …`, `time advance` driving reconnects; subscription list in `snapshot` |
| **3. Start** | `.live` (SSE, poke + refetch), `topic`, `stream`, the fake transport in `@weft-js/core/test` (T013), buses `memory` + `postgres`, the defaults table, schema hash and `app.stale`, R002, R003, R005, R006, W052, W053, P007 |
| **3b. Channels** (new, after the Phase 3 exit check) | `channel` over crossws, Origin + `authorize` + session re-check (R001, R004), `redis` / `nats` / `durable-object` buses, `tabs.channel`, `geolocation`, W055 |
| **Later** | values attached to pokes for shared-scope queries; multi-tab leader election (Web Locks + BroadcastChannel); offline mutation queue with idempotency keys; sync-engine adapters (TanStack DB / Electric / Zero) outside core; WebTransport |

### 9.5 Not in v0

- **No diff-based or read-set-tracked live queries.** Tags plus the dev check only, consistent with PLAN §12.
- **No sync engine and no client database** (PLAN §10). No offline mutation queue.
- **No per-subscription `EventSource`**, and no transport choice exposed to users (no `transport: 'ws' | 'sse'` knob).
- **No WebTransport, no long-poll fallback.**
- **No SharedWorker or cross-tab connection sharing.**
- **No presence/CRDT layer.** That is Liveblocks/PartyKit territory, and `channel` + `topic` is enough to build on.
- **No client-side validation of server pushes in prod.** The schema hash handles skew.
- **No battery API.** No permission prompts at mount.
- **No raw socket escape hatch in docs.** A real need becomes a weft feature, or a `P` diagnostic allowance in
  `weft.config.ts`.

---

## Sources

- Nitro WebSocket and SSE: https://nitro.build/docs/websocket · h3 v2: https://unpkg.com/h3@2.0.1-rc.26/dist/docs/0.guide/3.advanced/1.websocket.md
- Vercel WebSockets (public beta 2026-06-22, durations, per-instance publish): https://vercel.com/support/articles/do-vercel-serverless-functions-support-websocket-connections · https://ably.com/vercel/websockets-on-vercel
- Cloudflare Durable Objects WebSockets and hibernation: https://developers.cloudflare.com/durable-objects/api/websockets
- WebTransport status: https://www.utsubo.com/blog/frontier-web-apis-2026-production-ready
- SSE through proxies: https://oneuptime.com/blog/post/2025-12-16-server-sent-events-nginx/view · https://tianpan.co/blog/2026-06-03-the-sse-keepalive-your-reverse-proxy-stripped-between-provider-and-client
- bfcache + WebSocket (Chrome 148): https://groups.google.com/a/chromium.org/g/blink-dev/c/52nlr8z3Png · MDN: https://developer.mozilla.org/en/docs/websockets/writing_websocket_client_applications
- SharedWorker on Android: https://groups.google.com/a/chromium.org/g/blink-dev/c/pS1PDOa69CU · https://www.notebookcheck.net/Chrome-148-Beta-for-Android-adds-Web-Serial-SharedWorker-support.1269721.0.html
- SvelteKit remote functions (`query.live`): https://svelte.dev/docs/kit/remote-functions · https://svelte.dev/blog/whats-new-in-svelte-june-2026
- tRPC subscriptions: https://trpc.io/docs/server/subscriptions · oRPC event iterator: https://orpc.dev/docs/event-iterator
- Convex: https://docs.convex.dev/understanding/overview
- Zero: https://zero.rocicorp.dev/docs/release-notes/1.0 · https://infoq.com/news/2026/06/zero-version-1 · https://zero.rocicorp.dev/docs/release-notes/0.15
- Electric: https://electric-sql.com/docs/api/http · TanStack DB: https://tanstack.com/db/latest/docs · https://github.com/TanStack/db
- Supabase Realtime: https://supabase.com/docs/guides/realtime/subscribing-to-database-changes · https://supabase.com/docs/guides/realtime/benchmarks
- Meteor: https://blog.meteor.com/tuning-meteor-mongo-livedata-for-scalability-59327a144a9 · https://github.com/meteor/docs/blob/version-1.4.2/long-form/oplog-observe-driver.md
- Turbo 8 refreshes: https://rubydoc.info/github/hotwired/turbo-rails/main/Turbo/Broadcastable · https://dev.37signals.com/a-happier-happy-path-in-turbo-with-morphing/ · https://fly.io/ruby-dispatch/turbo-8-in-8-minutes/
- Postgres NOTIFY: https://www.postgresql.org/docs/current/sql-notify.html · https://dbos.dev/blog/postgres-listen-notify-scalability
- CSWSH: https://blog.includesecurity.com/2025/04/cross-site-websocket-hijacking-exploitation-in-2025/ · https://advisories.gitlab.com/golang/github.com/amir20/dozzle/CVE-2026-44985/ · https://cvefeed.io/vuln/detail/CVE-2026-34403 · https://advisories.gitlab.com/npm/@grackle-ai/server/GHSA-w3hv-x4fp-6h6j/ · https://osv.dev/vulnerability/JLSEC-2026-614
- VueUse SSR: https://vueuse.org/core/useMediaQuery/ · solid-primitives: https://github.com/solidjs-community/solid-primitives
- Zod 4 defaults: https://zod.dev/v4 · https://app.unpkg.com/zod@4.6.7/files/src/v4/classic/tests/default.test.ts · Drizzle + Zod: https://orm.drizzle.team/docs/zod
- MSW WebSocket/SSE: https://mswjs.io/docs/websocket/ · https://mswjs.io/docs/sse/
- Version numbers: `npm view <pkg> version` / `time`, run 2026-10-28 (nitro, h3, crossws, @trpc/server, @orpc/server, @rocicorp/zero, @electric-sql/client, @tanstack/db, convex, partyserver, @supabase/realtime-js, @solid-primitives/*, @vueuse/core, drizzle-orm, drizzle-zod, zod, @sveltejs/kit, unstorage, ioredis, @nats-io/transport-node, msw).
