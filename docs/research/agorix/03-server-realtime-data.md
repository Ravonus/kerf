# Agorix 03 — Server, real-time, data and multiplayer stack → weft

Research date: 2026-10-28. Source read at `agorix-discord` HEAD `f486721` (2026-07-05; `packages/ui` 0.2.0) and Velatis
(`~/dev/medium`) HEAD `72fddb65f`. Velatis vendors an older build (`f776aa7`, see `vendor/agorix-ui/SOURCE.md`).
Statements marked **(unverified)** could not be confirmed from the code on disk (production config, cookie flags in
deployed envs).

**Path prefixes used in citations:**
- `ui/` = `~/dev/agorix-discord/packages/ui/src/`
- `vault/` = `~/dev/agorix-discord/apps/vault/src/` (the Fastify server behind agorix-discord's web app)
- `rts/` = `~/dev/medium/tools/realtime-test-server/src/` (copy of `ui/../examples/socket-server/ts`)
- `vel/` = `~/dev/medium/src/` (Velatis' own production SSE+POST endpoints)

**Decision under review:** Agorix (`@agorix/ui`) becomes weft's default front-end toolkit, and its server, real-time,
data and multiplayer machinery gets hooked into weft. This doc covers only that machinery. Components and tokens are a
separate doc.

---

## TL;DR

1. **Agorix has more real-time *surface* than doc 07 planned**, and it is already in production:
   - seven client transports (WS, SSE, SSE+POST "hybrid", BroadcastChannel, socket.io, WebRTC data channel, LiveKit),
     run in parallel by an `auto` adapter with same-browser leader election;
   - presence, anchor-based cursors, an interaction relay, synced DOM;
   - DB change capture (Postgres trigger SQL generator, Mongo change streams);
   - list and cursor pagination contracts with seven DB adapters.

   07 left most of this for "later" or "not in v0".
2. **The core protocol is weaker than 07 on every axis 07 cared about:**
   - **Trust:** any connected client can publish any event to any channel. There is no `authorize` and no Origin check
     in the kit or its reference server, and payloads are `z.unknown()`.
   - **Resume:** `seq` has no epoch, so a server restart silently drops events. A Redis INCR-then-publish race silently
     drops events too.
   - **Invalidation:** watchers push **full rows** to channels anyone can join. The invalidation contract is broken end
     to end: watcher events never reach `defineResource`.
   - **Caching:** `defineResource` caches at module scope, so SSR snapshots can leak other users' rows.
3. **Verdict: merge, with 07's protocol winning and Agorix's breadth riding on it.**
   - 07's model is the one weft keeps: typed `topic` / `stream` / `channel`, tag pokes, `<epoch>:<seq>`, `authorize`,
     Origin allowlist, size and rate caps.
   - Agorix contributes: the SSE+POST fallback for `channel`, leader election (rebuilt on Web Locks), delivery
     classes, batching/coalescing, DB watchers that emit **tags** (not rows), the list/cursor contract, DB adapters and
     LiveKit/WebRTC/socket.io as packs, and presence/cursors as `@weft/multiplayer`.
4. **One data concept.** `defineResource` / `useResource` / `createMutation` / `useRealtimeInvalidation` collapse into
   `query` / `mutation` / `.live`. A `crud()` generator gives the Agorix ergonomics back as plain queries and mutations.
5. **Fix production first.** Velatis and agorix-discord run this code today. Five issues need hotfixes in Agorix
   regardless of weft (§4, items C1–C3, H1, H2).

---

## 1. Architecture map (as built)

```
 BROWSER TAB (React)                                              SERVER(S)
 ┌───────────────────────────────────────────────┐
 │ hooks: useResource · useSyncedState ·          │
 │ createRealtimeStore · createRealtimeEvent ·    │
 │ useRealtimeInvalidation · SyncedDom/Tree ·     │
 │ InteractionRelay · usePageCursors · Multiplayer│
 └──────────────┬────────────────────────────────┘
                │ RealtimeClient (fan-out per channel, optional Zod per subscribe)
 ┌──────────────▼────────────────────────────────┐   meta BC "__agorix_local_presence__"
 │ createAutoAdapter (mode:'auto')               │◄──► other tabs: heartbeat 1s, TTL 4s,
 │  legs in parallel: bc · ws · hybrid · rtc     │     lowest startedAt = leader; followers
 │  dedupe: seq high-water + id LRU(512)         │     relay wire traffic through the leader
 │  presence gate: serverCount → BC-only publish │
 └──┬─────────┬──────────────┬────────────┬──────┘
    │BC       │WS            │SSE + POST  │LiveKit / RTCDataChannel (peer to peer, no server)
    ▼         ▼              ▼            ▼
 same-origin  /ws        /sse (ready{connectionId}) + /pub {op|event|events|ops}
 tabs         │              │
              └──────┬───────┘
         ┌───────────▼─────────────┐    ┌─────────────────────────────────────┐
         │ reference / app server   │    │ @agorix/ui/server/realtime          │
         │ channels→conns · seq/chan│◄───│ RealtimeBus · createInMemoryBus     │
         │ ring buffer · presence   │    │ postgresWatcher (trigger → NOTIFY)  │
         │ Redis: INCR seq + pubsub │    │ mongoChangeStream → bridgeChangeToBus│
         └──────────────────────────┘    └─────────────────────────────────────┘
 Data plane (separate): defineResource (module-scope cache) ⇄ DataSource (rest | server adapters:
 drizzle · kysely · prisma · sql · mongo · firestore · dynamodb) ⇄ createListHandler/createCursorHandler
 (parseListParams → buildListResultV2 · AgorixError codes)
```

There are **three server implementations** of the same wire:
- `rts/server.ts`: the reference server, plus Go and Rust twins in `ui/../examples/socket-server/{go,rust}`. Used for
  Velatis local dev.
- `vel/server/realtime/bus.ts` + `vel/app/api/realtime/{sse,pub}/route.ts`: Velatis production, Next.js, SSE+POST
  only.
- `vault/routes/web/realtime.ts` + `vault/lib/syncBus.ts`: agorix-discord, Fastify. WS + SSE+POST, session auth, and a
  whiteboard ACL.

### Wire protocol

| Aspect | What exists | Where |
|---|---|---|
| Event frame | `{type, channel, payload?, at, id?, seq?, transport?, syncIntent?, importance?}` | `ui/data/realtime/types.ts:34-50` |
| Compact frame | `{t,c,p,a,i,s,tr,in,im}`, opt-in on both ends by deployment flag. A mismatch "silently fails" | `ui/realtime/wireCodec.ts:16-19,46-99` |
| Control ops | `{op:'subscribe', channel, sinceSeq?}` · `{op:'unsubscribe', channel}`; hybrid adds `connectionId`, `ops[]`, `events[]` | `ui/realtime/webSocketAdapter.ts:13-16`, `ui/realtime/createHybridAdapter.ts:19-29` |
| Sequencing | server stamps `seq` per channel; client keeps a per-channel high-water mark that is **never reset** | `webSocketAdapter.ts:49-53,114-118` |
| Resume | resubscribe with `sinceSeq`; server replays its ring (1024 in `rts`, 256 in Velatis); `sinceSeq` absent ⇒ replay from 0 | `rts/server.ts:163-188`, `vel/server/realtime/bus.ts:199-231` |
| Reserved types | `__presence.update {count}` (server→client, no seq) | `rts/server.ts:211-223`, `ui/realtime/createAutoAdapter.ts:494-500` |
| Auth | none in the kit (the WS adapter only offers `protocols`); session cookie + 4401 in vault; Origin only on Velatis POST | `vault/routes/web/realtime.ts:136-155`, `vel/app/api/realtime/pub/route.ts:82-118` |
| Validation | client parses the frame with a non-strict Zod object; payload schema is opt-in per subscribe | `ui/realtime/createRealtimeClient.ts:74-96` |

### Transport selection

- `createRealtimeKit({mode})` picks `local | ws | hybrid | auto` (`ui/realtime/createRealtimeKit.ts:59-148`).
- `auto` runs every leg **in parallel**, not tiered. BC is always hot. Wire legs live only in the leader tab. Per
  event, the route comes from three things:
  - **transport hints:** the `transport` / `syncIntent` / `importance` fields, or the `__syncIntent` keys smuggled
    into payloads (`ui/realtime/transportIntent.ts:37-80`);
  - **the presence gate:** `remoteCount = serverCount − 1`; at 0, the event goes BC only (`createAutoAdapter.ts:404-418`);
  - **hybrid batching:** rate-adaptive, at most one POST in flight per lane, a coalesce key, and a priority lane
    (`createHybridAdapter.ts:149-278`).

### Cache, invalidation, DB adapters, watchers

- **`defineResource`:** a per-definition closure of `lists`/`items` maps (`ui/data/defineResource.ts:128-132`).
  Invalidation is **resource-wide**: any `resource.*` event for the name stales every list (`:289-307`). SSR goes
  `serializeResources` → `ResourceCacheProvider` hydrating in an effect (`ui/data/ResourceCacheProvider.tsx:57-97`).
- **Mutations** are twofold: `createMutation` has no cache link (`ui/data/createMutation.ts:135-201`);
  `useResourceMutation` eager-invalidates (`ui/data/useResource.ts:157-175`).
- **`data/scheduler/` is not a job scheduler.** It is a booking/availability *domain* contract shared with vault
  (`ui/data/scheduler/primitives.ts:3-12`).
- **List/cursor adapters:** `drizzle`, `kysely`, `prisma`, `sql`, `mongo`, `firestore`, `dynamodb` turn
  `ParsedListParams` into native query parts with no hard dependency (`ui/data/adapters/drizzle.ts:16-34`).
- **Watchers:** `generatePostgresTriggerSql` + `createPostgresWatcher` (LISTEN, 7.8 KB stub fallback,
  `ui/data/realtime/postgresWatcher.ts:121-173`) and a Mongo change stream, both via `bridgeChangeToBus`
  (`ui/data/realtime/tableWatcher.ts:105-121`).

### View scope and synced state/DOM

- **`viewScope`** suffixes channels with `::v:<pathname>` and monkey-patches `history` to track routes.
- **`useSyncedState`**: last-write-wins over `state:<key>`, own echo suppressed by `id` (`useSyncedState.ts:60-110`).
- **`SyncedDom` / `SyncedTree`:** the presenter's MutationObserver publishes `{sel, attr, value}`; receivers
  `querySelector` + `setAttribute` (`ui/realtime/SyncedTree.tsx:49-56,126-143`).
- **`InteractionRelay`** replays remote hover/focus/press as dispatched native events (`InteractionRelay.tsx:326-336`);
  **cursors** are anchor-relative with a viewport-fraction fallback (`usePageCursors.ts`).

---

## 2. What Agorix got right (keep)

- **The adapter seam** (`RealtimeAdapter`, `ui/data/realtime/types.ts:107-136`), with injectable
  `WebSocketImpl`/`EventSourceImpl`/`fetchImpl`: exactly the hook 07's fake transport needs.
- **The SSE+POST hybrid** (`ready{connectionId}`, batched `ops[]` on reconnect, which Velatis learned the hard way:
  `vel/app/api/realtime/pub/route.ts:14-20`; a rate-adaptive POST lane). The right `channel` fallback without WS.
- **Register-before-replay** (`rts/server.ts:164-182`), the tRPC rule from 07 §4. Half-right; see H3.
- **Delivery intent** (`importance`, `syncIntent: cursor|drag|…`): a real need 07 did not model.
- **Hard-won lessons** in comments (inline-closure resubscribes, `useRealtimeInvalidation.ts:40-50`; StrictMode;
  cursor POST floods, `apps/web/src/lib/realtimeClient.ts`) and vault's fail-closed per-subscriber
  `ChannelTransform` (`vault/lib/syncBus.ts:66-80`).
- **Anchor-based cursors** and the **list contract** (allowlisted sort/filter/search, clamped page size, V2 envelope,
  `AgorixError` codes, contract validators). Both are framework-agnostic.

---

## 3. Judgement by axis

| Axis | Finding |
|---|---|
| **Ordering** | Per channel by `seq`. Nothing across channels (same as 07). Seq is a bare integer with no epoch (C2), and Redis stamping races (H2). |
| **Resume** | `sinceSeq` + ring buffer. There is no "too far behind → reset": a gap larger than the ring is silent loss. The plain SSE adapter has no resume at all; it relies on `EventSource` + `id:`, which Velatis fills with `event.id`, not `seq` (`vel/app/api/realtime/sse/route.ts:42`). |
| **Reconnection** | WS: doubling backoff without jitter (`webSocketAdapter.ts:122-130`). No `online`/visible trigger, no bfcache handling. Hybrid recycles on 404, but Velatis answers an unknown connection with **204**, so recycle never fires (`vel/server/realtime/bus.ts:201-202`). |
| **Races** | Optimistic echo divergence (H4), stale in-flight overwrite (M1), replay-after-live loss (H3). |
| **Security** | Open publish/subscribe (C1), DOM attribute injection (C3), row leakage (H1), missing Origin on WS (H5), spoofable reserved events (M3), SQL identifier pass-through (H6). |
| **Scaling** | Redis fan-out exists in `rts` and Velatis, with one firehose channel (`agorix:bus` / `medium:realtime:events`), so every node receives every event. The ring is per node in `rts` (resume only works on the same node, as its header admits, `rts/server.ts:33-37`) and shared in Velatis. A connectionId is node-local, so SSE+POST needs sticky routing **(unverified whether prod pins)**. |
| **Type safety** | Stringly channels; `payload: unknown`; Zod opt-in per call site. `defineResource.schema` is stored but **never used to parse** (`defineResource.ts:41,115-385`; the only references are type positions). The compact codec decodes without validation (`wireCodec.ts:75-77`). |
| **Testability** | ~150 unit tests (data contract, auto adapter, store, cursors, codec). **Zero tests** for the WS/SSE/hybrid adapters, resume, any server, or the watcher→resource path. The bug in M2 would have been caught by one. |

---

## 4. Issues, severity-ranked

**Critical**

- **C1. Any client can subscribe or publish anything on any channel.** `rts/server.ts:317-336` accepts any `{op}` or
  event frame, with `CORS *` (`:354-358`) and no auth. Velatis checks Origin only (and **accepts a missing Origin**,
  `route.ts:84-85`), so any visitor can publish to a live session's presenter-authority channel; the presenter role
  is a client prop (`vel/features/live-session/workspace/collaboration/SessionMultiplayer.tsx:20-28`). vault leaves
  non-whiteboard channels open to any session (`vault/routes/web/realtime.ts:112-118`). Fix: 07's required
  `authorize` (R001); interim, a server-side channel-prefix allowlist + authorize callback.
- **C2. A restart drops events silently.** Server seq restarts at 1 (`rts/server.ts:85-88`, "that's fine": it isn't).
  The client high-water mark survives by design (`webSocketAdapter.ts:49-53`) and drops every `seq ≤ old mark`
  (`:114-118`; same in hybrid `:340-344` and auto `:503-507`). After a deploy, live channels go dark until counters
  pass their old values: Velatis' in-process mode (no `REDIS_URL`) and every in-memory `rts`/vault deploy. Fix: 07's
  `<epoch>:<seq>` + `reset`.
- **C3. Remote DOM attribute injection.** `SyncedTree` receivers apply `{sel, attr, value}` with `attr: z.string()`
  (`SyncedTree.tsx:54,140`). Only the presenter side filters attributes (`:122`), and receivers never check that the
  sender *is* the presenter. Combined with C1, any channel member can set `onclick`, `href="javascript:…"` or `srcdoc`
  on viewers' DOM. The ring buffer then replays it to future joiners. **Stored XSS.**

**High**

- **H1. Watchers broadcast full rows to channels named after tables.** `row_to_json(NEW)` and `OLD`
  (`postgresWatcher.ts:139-141`) become the `payload` (`tableWatcher.ts:118`) on channel `payload.table` (`:111`).
  Password hashes, emails and tenant data go to every subscriber of `users`. 07's poke model sends tag names only.
- **H2. Redis seq stamping races and loses events.** `INCR` then `MULTI rpush` then `PUBLISH` are separate round
  trips (`vel/server/realtime/bus.ts:276-288`; `rts/server.ts:268-287`). With concurrent publishers, seq 6 can arrive
  before seq 5, and the client then *drops* 5 permanently (high-water dedupe). This is not a reordering; the event is
  lost.
- **H3. A subscribe in Redis mode can lose the gap.** Velatis adds the connection to `channelSubs` (`bus.ts:203-209`),
  then `await`s Redis `LRANGE` (`:217-220`). A live event fanned out during the await carries a higher seq, so the
  replayed lower seqs are dropped by the client. Listener-before-backlog needs **buffer live until replay completes**,
  not just "register first".
- **H4. `useSyncedState` can diverge permanently.** It suppresses its own echo by id (`useSyncedState.ts:75-79`). With
  interleaving `[mine A → theirs B (seq n) → mine A (seq n+1)]`, this tab applies B and then skips A. It shows B while
  every other tab shows A. Fix: apply by server order and compare against the pending write, not by skipping the echo.
- **H5. No Origin check on WS upgrades.** vault's `/app/api/realtime/ws` authenticates by cookie only
  (`vault/routes/web/realtime.ts:136-155`). The CSRF guard skips GET. With `SameSite=Lax` (`vault/lib/cookies.ts:88`),
  sibling subdomains can open an authenticated socket. This is the 2026 CVE pattern from 07 §5.
- **H6. Identifier pass-through in the `sql` adapter.** With no `sortFieldMap`, the raw key reaches
  `ORDER BY ${col}` (`ui/data/adapters/sql.ts:84-95,164`). `parseListParams` with no allowlist accepts any sort field
  (`contract/parseListParams.ts:105-110`), and the README's server example calls it with no options. SQL injection
  with the default options.
- **H7. SSR cache leaks across requests.** `defineResource` caches live at module scope (`defineResource.ts:128-129`).
  `serializeResources` dumps *every* list the process has loaded (`ResourceCacheProvider.tsx:92-95`) into the HTML.
  On a shared server that means other users' rows.

**Medium**

- **M1. Stale overwrite.** `invalidateList` nulls `inflight` (`defineResource.ts:218-222`), but the old promise still
  resolves and writes `entry.value`/`loadedAt` (`:173-178`), so older data wins. weft's resource cancels via
  `AbortSignal`.
- **M2. The invalidation contract is broken end to end.**
  - Watcher events carry no `resource` field and set `id` to a dedupe key (`tableWatcher.ts:113-119`), so
    `defineResource` ignores them (`:294`).
  - The `id` field means both "dedupe id" and "row id". Servers stamp random ids (`rts/server.ts:332`, `bus.ts:245`),
    so `useRealtimeInvalidation({id})` never matches (`contract/invalidation.ts:33-41`).
- **M3. Reserved events are spoofable.** A client may publish `type:'__presence.update', payload:{count:0}`. Every
  auto adapter then believes it has no remote peers and stops sending on the wire (`createAutoAdapter.ts:404-418,494-500`).
  Reserved prefixes must be rejected inbound.
- **M4. Leader election runs on timers.** It uses a 1 s heartbeat with a 4 s TTL (`createAutoAdapter.ts:180-181`).
  Background tabs get timer throttling (intensive throttling to 1/min **(unverified current Chrome thresholds)**),
  so the leader goes "stale" and you get split brain and flapping. Web Locks (07 §4) gives exclusive ownership
  without heartbeats.
- **M5. `InteractionRelay` lets peers fire pointerdown/up, focus and input** on local elements
  (`InteractionRelay.tsx:326-336`). Any handler that doesn't check `isTrusted` becomes remotely triggerable.
- **M6. Hard caps exist only where apps added them.** vault has `maxPayload` 1 MiB; Velatis has `max(64)` events and
  120-char channels. `rts` reads unbounded bodies (`rts/server.ts:365-371`). None of them has rate limits,
  per-connection subscription caps or send-queue caps.

**Low.** `viewScope` patches `history` globally. A `wireFormat` mismatch fails silently. `__syncIntent` payload keys
leak transport concerns into domain data. `useSyncedState` promises server "last-wins, one event per key", but servers
keep a ring (`useSyncedState.ts:10-13` vs `rts/server.ts:233-239`): mounts replay up to 1024 stale values, and state
vanishes when the ring TTL (1 h, Velatis) expires. The domain `scheduler` sits in the UI kit. A connectionId isn't
bound to its session (`vault/routes/web/realtime.ts:301-304`).

---

## 5. Capability → weft mapping

Legend: **Adopt** = take as-is (framework-agnostic) · **Port** = React → weft primitives · **Merge** = fold into the 07
design (the winner is named) · **Pack** = optional package · **Drop**.

| Agorix capability | Call | Notes / which design wins |
|---|---|---|
| `UiRealtimeEvent` frame + `wireCodec` | **Merge (07 wins)** | weft frames are short-keyed by design and versioned with the schema hash. No per-deployment negotiation. The compact codec's measurement helper goes to `weft browser net`. |
| `createRealtimeClient` (per-channel fan-out) | **Merge** | Becomes the internal mux under `.live`/`stream`/`channel`. No public stringly `subscribe(channel)`. |
| `webSocketAdapter` | **Merge (07 protocol, Agorix code)** | Keep the backoff/resubscribe skeleton. Add jitter, `<epoch>:<seq>`, `reset`, `online`/visible triggers and bfcache handling. |
| `sseAdapter` (EventSource) | **Drop** | 07: a fetch-based reader that POSTs cursors. |
| `createHybridAdapter` (SSE+POST) | **Merge (Agorix wins on scope)** | 07 made `channel` WS-only. Agorix shows SSE+POST works and is needed on Netlify/Lambda. weft picks it **at build time per preset**, so there is still no user-facing transport knob (07 §9.5 holds). Keep batching, coalescing and the priority lane. |
| `createAutoAdapter` parallel legs | **Merge, reduced** | No parallel wire legs (each event once over one wire). BC stays for `tabs.channel`. **Leader election moves from 07 "Later" to Phase 3b, rebuilt on Web Locks;** the follower relay protocol is reused. The presence gate is dropped (spoofable, M3; the saving is marginal). |
| `transportIntent` (importance/syncIntent) | **Merge (Agorix idea, 07 strictness)** | Declared statically per channel message as `delivery: 'reliable' \| 'latest' \| 'ephemeral'`. Not runtime payload keys. |
| `broadcastChannelAdapter` | **Merge → `tabs.channel`** | 07 adds schema validation. |
| socket.io / WebRTC DC / LiveKit adapters | **Pack** | `@weft/realtime-socketio`, `@weft/realtime-webrtc`, `@weft/realtime-livekit` (meet). Ephemeral `channel` messages may ride them **only when the message is declared `trust: 'peers'`** (it bypasses server `authorize` and validation: R007). |
| `createRealtimeStore` / `createRealtimeEvent` / `useRealtimeChannel` | **Port** | Map onto `channel` + boxes: `chat.latest('x')`, `chat.on`, `chat.collect`. Three overlapping APIs become one. |
| `useSyncedState` | **Port, redesigned** | `shared(key, schema)`, backed by a server-declared `sharedState` with `authorize`, server-side LWW compaction (one value per key, not a ring) and fixed echo handling (H4). |
| `SyncedDom` (class/scroll/attr/hash) | **Pack** `@weft/multiplayer` | In weft, sync **the box, not the DOM**; fine-grained rendering makes DOM mirroring redundant. Keep `syncedScroll`/`syncedHash`. Attribute sync only through an allowlist. |
| `SyncedTree` (MutationObserver mirror) | **Drop** | C3. Replace it with `shared()` state bound to the components. |
| `InteractionRelay`, `PageCursorsLayer`, `usePageCursors`, `MultiplayerProvider`, `LiveCursorsOverlay`, `LiveHover/Click` | **Pack** `@weft/multiplayer` | Presence + cursors on `channel` with `delivery:'latest'`. Adopt `resolveCursorPosition`/`applyCursorEvent` as-is (pure). Remote events go to a typed callback; no synthetic native events (M5). |
| `viewScope` | **Drop** | Channel params are typed (`params: {roomId}`); the route is known to the router. No history patching. |
| `useRealtimeInvalidation` | **Drop** | Subsumed by `.live` + tags. |
| `useSmoothNumber` | **Port** → `weft/motion` (or ds) | Not real-time; a spring `Derived`. |
| `defineResource`, `useResource(Item)`, `useResourceMutation`, `ResourceCacheProvider`, `serializeResources` | **Merge (weft wins)** | `query`/`mutation`, the per-request SSR cache and tags. `crud()` (§7) restores the ergonomics. H7, M1 and M2 disappear by construction. |
| `createMutation` | **Drop** | `mutation()` + `<Form of>`. |
| List/cursor contract (`parseListParams`, `parseCursorParams`, `buildListResultV2`, `buildCursorResult`, `AgorixError`/`STATUS_FOR_CODE`, `defineColumns`, `expect*Endpoint` validators) | **Adopt** → `weft/start/list` | **Change one default:** allowlists are required and derived from the Drizzle table (closes H6). weft has no pagination contract today; this fills the gap. |
| `createListHandler` / `createCursorHandler` | **Port** | `query({ input: listInput(table, {...}) })`. No separate handler type. |
| Drizzle adapter | **Adopt** (core) | Already dependency-free. |
| Kysely / Prisma / SQL / Mongo / Firestore / DynamoDB adapters | **Pack** `@weft/db-*` | Beyond 07's Drizzle-only plan. `@weft/db-sql` requires maps (H6). |
| `rest` DataSource | **Drop** | The typed client replaces it (keep it in the compat shim only). |
| `RealtimeBus` + `createInMemoryBus` | **Merge (07 wins)** | 07's `realtime.bus: memory→postgres→redis\|nats\|durable-object` with replay in weft. Agorix's id-dedupe window survives as an option. |
| Postgres trigger SQL + watcher; Mongo change stream | **Merge (Agorix wins on scope)** | They answer "writes outside `mutation`" (cron, other services, psql), which 07 left to R003. **Emit tags, never rows**: `projects`, `projects:<id>`. Postgres in core; Mongo in `@weft/db-mongo`. |
| vault `ChannelTransform` (per-subscriber redaction) | **Merge** | A `channel` server option `filter({ msg, ctx }) → msg \| null`, fail-closed. |
| `rts` / Go / Rust reference servers | **Drop as product; adopt as fixtures** | They become a **protocol conformance suite**. A Rust/Go server for weft is 06's `remote()` and must speak weft's protocol. |
| `data/scheduler` booking contract | **Drop** (move to an agorix-discord package) | App domain. |

**Where Agorix already solved what 07 deferred:** multi-transport incl. HTTP-only channels, cross-tab leader/relay,
presence and cursors, CDC from non-weft writers, DB adapters beyond Drizzle, delivery classes, outbound batching and
coalescing.

**Where 07 is stricter and Agorix must change:** typed declarations instead of channel strings, required
`authorize`, Origin allowlist, size/rate/subscription caps, `<epoch>:<seq>` + `reset`, buffer-live-during-replay,
poke-not-payload invalidation, validation of client→server always, no transport knob.

---

## 6. Scorecard (1–5)

| Dimension | Agorix today | Target after merge | Note |
|---|---|---|---|
| Feature breadth | **5** | 5 | Beyond anything in 07's survey except Liveblocks. |
| Agent ergonomics (one way to do it) | **2** | 4 | Five overlapping state/event APIs; stringly channels. |
| Correctness (ordering/resume/races) | **2** | 4 | C2, H2, H3, H4, M1. |
| Security | **1** | 4 | C1, C3, H1, H5, H6. vault shows the right instincts (session, 4401, ACL, transforms) at app level. |
| Scaling | **3** | 4 | Redis fan-out exists; firehose channel, node-local connections. |
| Type safety (Zod end to end) | **2** | 5 | Zod present but opt-in; resource schema unused. |
| Testability | **3** | 5 | Good injection seams; no transport/server/resume tests. |
| Framework-agnostic core | **3** | — | Adapters, contract, watchers are agnostic; every consumer API is a React hook or a zustand store. |

---

## 7. Recommendation

### 7.1 One concept: `query` / `mutation` / `.live`, with `crud()` as a generator

`defineResource` was solving four problems: CRUD boilerplate, list params, a client cache, and live invalidation.
weft already owns the last two, so Agorix contributes the first two as **generators of ordinary definitions**. There is
no second cache.

```ts
// server/projects.ts
import { crud, listInput, query } from 'weft/start'
import { projects } from '~/db/schema'

export const Projects = crud(projects, {
  name: 'projects',                                   // tags: 'projects', 'projects:<id>'
  list: listInput(projects, {                         // allowlists REQUIRED, typed from columns (H6 closed)
    sort: ['createdAt', 'title'], filter: ['status'], search: ['title'],
    pageSize: { default: 25, max: 100 },
  }),
  scope: ({ ctx }) => eq(projects.orgId, ctx.user!.orgId),   // row scope applied to every op
  authorize: { write: ({ ctx }) => ctx.user?.role === 'admin' },
})
// Projects.list  : query<ListInput, ListPage<Project>>    (Agorix V2 envelope, cursor or page)
// Projects.get   : query<{id}, Project>                   tags ['projects:<id>']
// Projects.create/update/remove : mutation                invalidates ['projects', 'projects:<id>']

// client: no provider, no snapshot plumbing; SSR uses the per-request cache
const page = Projects.list.live({ sort: { field: 'createdAt', dir: 'desc' } })  // Resource<ListPage<Project>>
await Projects.update({ id, patch: { title } })         // single-flight refresh + poke to other tabs/users
```

**Before → after (port shapes):**

```ts
// Agorix (React)                                         // weft
const R = defineResource({ name, schema, source })        const R = crud(table, { name, list: listInput(table, …) })
const { data } = useResource(R, params)                   const data = R.list.live(params)          // Resource
const { run } = useResourceMutation(R, 'update')          await R.update({ id, patch })
useRealtimeInvalidation(client, { resource, refresh })    // nothing: tags poke .live
const [v, setV] = useSyncedState(client, 'deck:hash', 0)  const v = shared(deckHash, { key: props.deckId }) // State<number>
const s = createRealtimeStore({ client, channel, schema })const room = meet.connect({ id }); room.latest('slide')
<SyncProvider><SyncedTree>…</SyncedTree></SyncProvider>   // sync the box: shared(...) bound in components
```

### 7.2 Server: one protocol, Agorix's transports underneath

```ts
// server/meet.ts
export const meet = channel({
  params: z.object({ id: z.string().uuid() }),
  authorize: ({ ctx, params }) => isParticipant(ctx, params.id),        // required (R001)
  client: {
    cursor: { schema: CursorPayload, delivery: 'latest', trust: 'peers' }, // may ride @weft/realtime-livekit
    slide:  { schema: z.object({ n: z.number().int().min(0).max(999) }), delivery: 'reliable' },
  },
  server: { slide: z.object({ n: z.number().int(), by: z.string() }) },
  on: {
    slide: async ({ msg, ctx, params, room }) => {
      if (!(await isPresenter(ctx, params.id))) throw forbidden()       // presenter checked on the server (C1)
      room.publish('slide', { n: msg.n, by: ctx.user!.id })
    },
  },
  filter: ({ msg, ctx }) => redactFor(ctx, msg),                         // vault ChannelTransform, fail-closed
})

export const deckHash = sharedState('deck-hash', {                       // replaces useSyncedState
  key: z.string().uuid(), value: z.number().int().min(0),
  authorize: { read: isParticipant, write: isPresenter },               // LWW compacted server-side
})

// weft.config.ts
realtime: {
  bus: 'postgres',                          // memory | postgres | redis | nats | durable-object
  watch: { postgres: { tables: ['projects', 'tasks'] } },   // trigger → NOTIFY → TAG pokes only (H1)
  packs: [livekit({ url: env.LIVEKIT_URL })],
}
```

**Protocol rules weft ships (all 07, plus Agorix fixes):**
- **Seq** is `<epoch>:<seq>` per topic; an epoch change or a gap outside the ring gets `reset` (C2). The bus stamps
  atomically (Lua/`MULTI` with the publish, or a Postgres sequence in the same transaction), never INCR-then-publish
  (H2). Subscribe buffers live frames while the backlog streams, then splices by seq (H3).
- **Inbound:** `__*` types rejected (M3); strict frame schema; every client→server payload validated.
- **Transports:** SSE (fetch reader) for `.live`/`stream`; WS for `channel`, SSE+POST for `channel` on presets without
  WS; BC for same-browser relay. Chosen by preset and runtime, never by the user.
- **Web-standard handlers** (`handleRealtime(request)`, `handleUpgrade(request)`), so Fastify (vault) and Next
  (Velatis) can mount the weft server during migration.

### 7.3 Package layout

```
weft/start            query · mutation · .live · topic · stream · channel · sharedState · crud · listInput
                      list/cursor contract (adopted) · buses memory+postgres · postgres watcher (tags)
                      transports: sse-fetch, ws, sse+post · drizzle list adapter
weft/browser          tabs.channel (BC) · online/visible/lifecycle (07)  · leader election (Web Locks, 3b)
weft/test             fake transport + protocol conformance suite (ported from rts/go/rust behaviours)
@weft/realtime-redis | -nats | -durable-object        buses (07)
@weft/realtime-livekit | -webrtc | -socketio          transport packs for `trust:'peers'` / interop
@weft/multiplayer     presence · cursors (anchor) · interaction relay (typed) · syncedScroll/Hash
@weft/db-kysely | -prisma | -sql | -mongo (+change stream) | -firestore | -dynamodb   list adapters (+ watchers)
@weft/agorix-compat   server bridge speaking the Agorix wire on top of weft topics + codemods (temporary)
```

`@weft/agorix-compat` exists so that React clients on `@agorix/ui` 0.2 keep working against a weft server during
migration. It enforces `authorize` and the frame caps, and it strips row payloads. It is deleted after Phase 3c.

### 7.4 Proposed diagnostics (extends 07 §9.3)

- **R007:** a `channel` message with `trust:'peers'` that also has an `on` handler or a `filter`. Peer-to-peer
  messages never reach server code; split them.
- **R008:** a watcher or `topic.publish` payload containing table rows on a non-`user`-scoped topic. Publish tags, or
  declare the topic's `authorize`.
- **P008:** the app imports `@agorix/ui` real-time/data APIs (`createRealtimeKit`, `useSyncedState`,
  `defineResource`, `createMutation`, `SyncedTree`). The fix names the `weft migrate agorix` codemod.

### 7.5 Phase placement (PLAN §9 + 07 §9.4)

| Phase | Adds from Agorix |
|---|---|
| **Now (Agorix 0.2.x hotfix, outside weft)** | C1 server allowlist + authorize hook; C2 epoch in seq + client reset; C3 attr allowlist + presenter check, or disable `SyncedTree`; H1 watchers strip rows; H5 Origin on vault WS; H6 require maps in `sql`. Add WS/hybrid/resume tests against `rts`. |
| **1. Core** | `tabs.channel` semantics (validated BC) are designed alongside `weft/browser`. Nothing else. |
| **3. Start** | `crud()`, `listInput()`, the adopted list/cursor contract, the Drizzle adapter, the Postgres watcher → tags, the protocol fixes above, and the conformance suite in `weft/test`. |
| **3b. Channels** | `channel` with SSE+POST fallback, `sharedState`, `filter`, delivery classes, Web Locks leader election, the redis bus, and `@weft/multiplayer` (presence, cursors). R007, R008. |
| **3c. Agorix packs + migration** (new) | `@weft/realtime-livekit/-webrtc/-socketio`, `@weft/db-*`, `@weft/agorix-compat`, codemods, P008. Exit check: Velatis live sessions and vault whiteboards run on the weft server with the compat bridge, and pass the conformance and security suites. |
| **Later** | Values attached to pokes (07). Compact binary frames if `weft browser net` shows the need. |

### 7.6 Migration path for consumer apps

- **rr-store, ricochet_royale, fun-art:** import only components from `@agorix/ui` (grep found no data/real-time
  usage). They follow the design-system track and have nothing to do here.
- **Velatis (Next.js + React; `SessionMultiplayer` uses `createRealtimeKit` + `useSyncedState` + `PageCursorsLayer`):**
  1. Hotfix the vendored build and `vel/app/api/realtime/*`: per-prefix `authorize` (session membership), reject a
     missing Origin, epoch the seq, atomic Redis stamp, buffer live during replay, and 404 (not 204) for unknown
     connections so the hybrid adapter recycles.
  2. Replace `rts` in dev with `weft dev`'s memory server via `@weft/agorix-compat`.
  3. Mount `handleRealtime(request)` in Next route handlers; declare `meet` and `deckHash` server-side.
  4. Keep the React UI on `@agorix/ui` hooks, re-implemented as thin `useSyncExternalStore` wrappers over weft's
     framework-agnostic real-time client core. Move to the weft runtime only if the app is rewritten.
- **agorix-discord web + vault (Fastify):** vault's sessions, 4401 and ACL transforms map cleanly to `authorize` +
  `filter`. Mount the web-standard handlers in Fastify, convert `defineSyncedResource` call sites to `crud()` + tags,
  and move LiveKit to `@weft/realtime-livekit` with messages declared `trust:'peers'` (anonymous meeting guests ride
  RTC today precisely to skip server auth, `ui/realtime/useSyncedState.ts:36-41`; that becomes explicit). The booking
  `scheduler` contract moves to a vault/web shared package.

---

## Sources (all local, read-only)

- `agorix-discord/packages/ui`: exports, `tsup.config.ts`, README, `src/{server.ts,data,realtime,multiplayer}/**`,
  tests, `examples/socket-server/{ts,go,rust}`; `apps/web/src/lib/realtimeClient.ts`; vault `routes/web/realtime.ts`,
  `lib/{syncBus,realtime,cookies}.ts`, `index.ts` (CSRF guard).
- `medium`: `vendor/agorix-ui/SOURCE.md`, `tools/realtime-test-server`, `src/server/realtime/bus.ts`,
  `src/app/api/realtime/{sse,pub}`, `SessionMultiplayer.tsx`. `rr-store`, `ricochet_royale`, `fun-art`: import grep.
- weft: `docs/PLAN.md` §3, §4, §7b, §8, §9; research 02, 06, 07.
