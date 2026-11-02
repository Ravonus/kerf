# 35. Multiplayer and the realtime and db packs

Phase 3c's multiplayer half, on top of channels ([32](32-channels.md)). The Agorix inventory it draws on is
[agorix 03](agorix/03-server-realtime-data.md). Strong defaults stay one setting away from anything else: a socket and a
drizzle query need no pack, and each pack replaces exactly one thing.

## 1. The packs

| Package | What it is | Slot | Backed by |
| --- | --- | --- | --- |
| `@weft/multiplayer` | Library: presence, cursors, relay, synced scroll | none | a `channel` |
| `@weft/realtime-redis` | Bus (moved from `@weft/start`) | `realtime.bus` | ioredis |
| `@weft/realtime-nats` | Bus (moved) | `realtime.bus` | NATS |
| `@weft/realtime-durable-object` | Bus and its class (moved) | none: a binding, not an env var | Cloudflare |
| `@weft/realtime-webrtc` | Peer transport | none | RTCDataChannel |
| `@weft/realtime-socketio` | Peer transport, plus `relay()` | none | socket.io |
| `@weft/realtime-livekit` | Peer transport, plus `livekitTicket` | none | LiveKit |
| `@weft/db/sql` | List source | `db.adapter`, key `sql` | any tagged SQL |
| `@weft/db/kysely` | List source | key `kysely` | Kysely |
| `@weft/db/prisma` | List source | key `prisma` | Prisma |
| `@weft/db/mongo` | List source, `watchMongo` | key `mongo` | MongoDB |
| `@weft/db/firestore` | List source | key `firestore` | firebase-admin |
| `@weft/db/dynamodb` | List source | key `dynamodb` | AWS SDK |

The names follow the plan, not research 13's older `@weft/plugin-bus-*`. `postgresBus` stays in `@weft/start`, and
drizzle stays the default list source in `@weft/start/list/drizzle`, because a scaffolded app already has both drivers.

Left out on purpose: a `crud()` generator (the compiler can't see what a call returns), a channel `filter` hook (`to`
covers it), SSE plus POST as a socket fallback, a Web Locks leader tab, R007 (`trust: 'peers'` has no field to read:
transports live in multiplayer, and a server never sees them), warp's presence stack and join announcements (warp's
work), and `@weft/agorix-compat` and the codemods (a separate question).

## 2. `multiplayer()`: a fragment, not a wrapper

The compiler replaces `channel({...})` in server modules with a client stub, and it can only do that for a call it can
read. So `multiplayer()` returns messages an app spreads into its own `channel`. It keeps no roster: each connection
says hello, everyone answers, and TTL (three beats, 15 s) ends a peer who vanished. `left` covers the normal case.
Identity is stamped by the server from `user()`, so a client can't be someone else in a room.

Everything is volatile except `mp.relay`. A cursor from a minute ago isn't worth resuming, so `{ volatile: true }` skips
the hub's ring. Cursors go out at 12 a second, under the socket's 20.

Core gained what this needs and nothing else: `left`, `id` for handlers, `publish(…, { to, volatile })`, and
`Connection.room`, the id a transport pairs peers by.

## 3. Cursors between different screens

A position is an anchor (`data-anchor`) plus a fraction of its box, so two browsers of different sizes point at the same
thing. With no anchor it is a fraction of the page. `readCursor` validates every frame, whatever carried it.

## 4. Transports

A transport moves cursors and nothing else. Presence, relay and auth stay on the socket, which is the reason a peer
transport can't weaken them. Until `link.up`, and whenever it falls, cursors use the socket. `transportSuite` is the
contract, with five checks.

## 5. The list contract

`listInput` allowlists sort and filter fields, takes scalar filters only, and uses opaque keyset cursors. `columns` is
required, so a row can't return a column nobody named (agorix H6). A source declares what its backend can't do in
`limits` (for example a case-sensitive search), and `listSuite` skips exactly that. The result shape,
`{ items, total, next, prev }`, is what warp's `Table` reads.

## 6. How it's checked

`busSuite`, `listSuite` and `LIST_ROWS` are in `weft/test/plugins`, `transportSuite` in `@weft/multiplayer/test`. Each
runs on the real thing when its variable is set: `WEFT_TEST_REDIS`, `WEFT_TEST_NATS`, `WEFT_TEST_POSTGRES`,
`WEFT_TEST_MONGO`, `WEFT_TEST_DYNAMO`, `FIRESTORE_EMULATOR_HOST`. `packages/cli/test/packs.test.mjs` runs every pack
through the permissions audit.

`packages/multiplayer/scripts/e2e-browsers.mjs` builds a real app and drives two Chromium contexts at different sizes
through it, on each runtime, with one instance or two behind a bus, and over each transport. The packed gate runs the
same room from tarballs.
