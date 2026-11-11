<p align="center">
  <a href="https://github.com/Ravonus/kerf">
    <img src="https://raw.githubusercontent.com/Ravonus/kerf/main/site/public/logo.svg" width="88" height="88" alt="Kerf">
  </a>
</p>

<h1 align="center">@kerf-js/multiplayer</h1>

<p align="center">
  <strong>Presence, live cursors, a typed event relay and synced scroll, on a Kerf <code>channel</code>.</strong><br>
  Who a peer is comes from the server, never from the client, and every frame is checked before it reaches a page.
</p>

<p align="center">
  <a href="https://www.npmjs.com/package/@kerf-js/multiplayer"><img src="https://img.shields.io/npm/v/@kerf-js/multiplayer?color=145c3c&label=npm" alt="npm version"></a>
  <a href="https://github.com/Ravonus/kerf/blob/main/LICENSE"><img src="https://img.shields.io/badge/license-MIT-145c3c" alt="MIT license"></a>
  <a href="https://github.com/Ravonus/kerf/actions"><img src="https://img.shields.io/github/actions/workflow/status/Ravonus/kerf/quality.yml?branch=main&label=checks" alt="checks"></a>
</p>

<p align="center">
  <a href="#quick-start">Quick start</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/docs">Docs</a> ·
  <a href="https://github.com/Ravonus/kerf/tree/main/examples">Examples</a> ·
  <a href="https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md">Changelog</a> ·
  <a href="https://github.com/Ravonus/kerf">GitHub</a>
</p>

> [!IMPORTANT]
> **Early release (0.1.x).** APIs can change between minor versions. Pin the version and read the
> [changelog](https://github.com/Ravonus/kerf/blob/main/CHANGELOG.md) before you upgrade.

A shared document needs more than messages: who else is here, where their pointer is, what they just did. This package
adds those to a `channel` from `@kerf-js/start`. On the server, `multiplayer()` returns the message schemas and
handlers to spread into your channel. On the page, `presence()`, `cursors()`, `relay()` and `syncedScroll()` read and
write them. It is a library, not a plugin: there is nothing to put in `kerf.config.ts`.

## Highlights

- **Identity from the server.** A peer's `user` comes from your `user({ ctx, params, id })` on the server. A client
  only names its own state and cursor, and every frame is stamped with the connection that sent it.
- **No roster on the server.** Each client answers an `ask` and sends a heartbeat. Peers that stop beating expire, so
  any realtime bus works and the peers of an instance that died simply age out.
- **Cursors anchored to elements.** A position is a fraction of the nearest `[data-anchor]` element, so a pointer on a
  card lands on the same card on a screen of another size, or doesn't show when that card isn't on screen.
- **A typed relay.** `relay()` sends named events that the server checks against a schema per kind. A kind you didn't
  declare is refused. Handlers get data, never a synthetic DOM event.
- **Bounded by default.** Peer state is 4096 bytes, relay data 2048 bytes, a signal 16384 bytes, an anchor id 128
  characters. Cursors send at most 12 times a second, under a channel's default limit of 20.
- **Pluggable cursor transport.** Cursors go over the channel's socket. Pass a `transport` to move them to WebRTC,
  LiveKit or a Socket.IO relay; the socket carries them until that transport is up.
- **A drop-in `<Cursors>`.** Draws everyone else's pointer with their name and a colour that's the same for them
  everywhere. `aria-hidden`, and instant under reduced motion.

## Contents

- [Install](#install)
- [Quick start](#quick-start)
- [The server half](#the-server-half)
- [Presence](#presence)
- [Cursors](#cursors)
- [The relay](#the-relay)
- [Synced scroll and hash](#synced-scroll-and-hash)
- [Transports](#transports)
- [API reference](#api-reference)
- [Limits](#limits)
- [Troubleshooting](#troubleshooting)
- [End-to-end tests](#end-to-end-tests)
- [Related packages](#related-packages)

## Install

```bash
# npm
npm install @kerf-js/multiplayer

# pnpm
pnpm add @kerf-js/multiplayer

# bun
bun add @kerf-js/multiplayer
```

It's a library, not a plugin: there's nothing to add to `kerf.config.ts`. You import it in a page and in
`src/realtime.server.ts`.

`@kerf-js/core` and `@kerf-js/start` are peer dependencies; every Kerf app has them.

## Quick start

The server half goes into a `channel`, next to any messages of your own:

```ts
// src/server/doc.ts
import { channel } from '@kerf-js/start'
import { multiplayer } from '@kerf-js/multiplayer/server'
import { z } from 'zod'

const mp = multiplayer<{ id: string }>({
  user: ({ ctx }) => ({ id: ctx.user!.id, name: ctx.user!.name }),
  relay: { ping: z.object({ at: z.string().max(64) }) },
})

export const doc = channel({
  params: z.object({ id: z.string().max(64) }),
  authorize: ({ ctx }) => !!ctx.user,
  client: { ...mp.client },
  server: { ...mp.server },
  on: { ...mp.on },
  left: mp.left,
})
```

The page reads it:

```tsx
// src/routes/room.tsx
import { state } from '@kerf-js/core'
import { cursors, presence, relay } from '@kerf-js/multiplayer'
import { Cursors } from '@kerf-js/multiplayer/ui'
import { doc } from '#/server/doc'

export default function Room() {
  const chat = doc.connect({ id: 'lobby' })
  const typing = state(false)
  const live = presence<{ typing: boolean }>(chat, {
    state: () => ({ typing: typing.value }),
  })
  const pointers = cursors(live)
  const events = relay<{ ping: { at: string } }>(chat)
  events.on('ping', (e) =>
    console.log(`${e.peer} pinged ${e.data.at}`),
  )

  return (
    <main>
      <ul>
        {live.peers.value.map((p) => (
          <li key={p.id}>
            {p.user.name}
            {p.state?.typing ? ' (typing)' : ''}
          </li>
        ))}
      </ul>
      <section
        data-anchor="board"
        style="height:300px"
      />
      <button onClick={() => events.emit('ping', { at: 'board' })}>
        Ping
      </button>
      <Cursors of={pointers} />
    </main>
  )
}
```

Open the page in two browsers signed in as different users: each sees the other in the list, their pointer over the
board, and their pings.

## The server half

`multiplayer(options)` from `@kerf-js/multiplayer/server` returns four things to spread into `channel({ … })`:

| Field    | Goes into         | What it is |
| -------- | ----------------- | ---------- |
| `client` | `client: { … }`   | Schemas for what a client may send: `mp.hello`, `mp.state`, `mp.answer`, `mp.cursor`, `mp.relay`, `mp.signal`. |
| `server` | `server: { … }`   | The messages the server sends back: `mp.you`, `mp.peer`, `mp.gone`, `mp.ask`, `mp.cursor`, `mp.relay`, `mp.signal`. |
| `on`     | `on: { … }`       | A handler per client message. |
| `left`   | `left`            | Tells the room a connection left (`mp.gone`) and forgets who it was. |

Every name starts with `mp.`, so your own messages sit beside them. All of them except `mp.relay` are published as
`volatile`.

| Option   | Type                                                      | Default  | What it does |
| -------- | --------------------------------------------------------- | -------- | ------------ |
| `user`   | `({ ctx, params, id }) => PeerUser \| Promise<PeerUser>`  | required | Who this connection is. Must return an object with a string `id`. Runs once per connection, then cached until `left`. |
| `relay`  | `Record<string, StandardSchemaV1>`                        | `{}`     | The relay's event kinds and the schema each one's data must pass. Nothing else is relayed. |
| `ticket` | `({ id, user, params, ctx }) => unknown`                  | none     | A credential for a cursor transport, handed to the client with its id: `livekitTicket()`, `socketioTicket()`. |
| `state`  | `number`                                                  | `4096`   | Bytes one peer's `state` may be, as JSON. |

What happens on a join: the client sends `mp.hello` with its state. The server answers `mp.you` (the connection's id,
and the ticket if there is one) to that client only, tells everyone else `mp.peer`, and sends `mp.ask` so each of them
answers with their own state.

The server module also exports the ticket helpers that transports build on:

| Export                          | What it does |
| ------------------------------- | ------------ |
| `signTicket(claims, secret)`    | An HS256 JWT over `claims`, the format LiveKit reads and a relay can check with one shared secret. |
| `verifyTicket(ticket, secret)`  | The claims, or `null` for a bad signature, another algorithm, or a past `exp`. A ticket without a numeric `exp` is refused. |
| `roomId(params)`                | A stable name for a room that a third party holds: 32 characters of the SHA-256 of the params, so it says nothing about them. |
| `cursorSchema`                  | The schema a cursor must pass: `{ x, y }` fractions in `[-0.5, 1.5]`, an optional anchor id of up to 128 characters and style of up to 16, or `null`. |

## Presence

```ts
const live = presence<S>(conn, options)
```

`conn` is what `channel.connect()` returns. `presence` announces this connection, follows `state`, and keeps the list
of everyone else current.

| Option      | Type                 | Default | What it does |
| ----------- | -------------------- | ------- | ------------ |
| `state`     | `S \| () => S`       | none    | This connection's own state. A function is followed: a change is sent, coalesced over 50 ms. It goes to everyone on every change, so keep it small. |
| `beat`      | `number` (ms)        | `15000` | Time between heartbeats. A peer unheard for three beats expires. |
| `transport` | `PeerTransport`      | none    | Carries cursors between peers, with the socket as the fallback. See [Transports](#transports). |

| Returns      | Type                         | What it is |
| ------------ | ---------------------------- | ---------- |
| `peers`      | `Derived<Peer<S>[]>`         | Everyone else here, oldest first: `{ id, user, state, at }`. `at` is stamped by this machine's clock. |
| `self`       | `Derived<string \| undefined>` | This connection's id, once the server has said. |
| `via`        | `Derived<string>`            | Which way cursors go: `'socket'`, or the transport's name once it is up. |
| `connection` | the `conn` you passed        | |

When the connection opens or moves to another room, the list empties and `mp.hello` goes out again. A channel reset
(`onReset`) does the same.

## Cursors

```ts
const pointers = cursors(live, options)
```

`cursors` follows this page's pointer, sends it (latest wins), and tracks everyone else's. A pointer over an element
with the anchor attribute is sent as a fraction of that element, scroll included. Elsewhere it is a fraction of the
viewport. When the pointer leaves the page, `null` is sent and the cursor disappears for everyone.

| Option   | Type                               | Default         | What it does |
| -------- | ---------------------------------- | --------------- | ------------ |
| `anchor` | `string`                           | `'data-anchor'` | The attribute that holds an element's id. Use the same ids on every client. |
| `rate`   | `number`                           | `12`            | Sends a second. 12 keeps a socket under its default 20 a second, with room for everything else. |
| `idle`   | `number` (ms)                      | `5000`          | A cursor that hasn't moved for this long is marked `idle` (`<Cursors>` fades it). |
| `root`   | `() => HTMLElement \| Document`    | the document    | Where the pointer is followed. |
| `style`  | `string`                           | none            | Sent with each position, up to 16 characters; yours to interpret. |

`pointers.list` is a `Derived<LiveCursor[]>`, each with `id`, `peer` (missing until their presence arrives), `at`,
`left`, `top` (page pixels on this screen), `moved` and `idle`. A cursor whose anchor isn't on this page isn't in the
list: drawing it at (0, 0) would be wrong. Scrolling and resizing re-place them.

`<Cursors of={pointers} />` from `@kerf-js/multiplayer/ui` draws the list: a fixed, `aria-hidden` overlay with an arrow
per peer, their `user.name` in a label, and a colour from `hue(user.id)`. Cursors glide over 120 ms, and jump under
`prefers-reduced-motion`. Draw your own from `pointers.list` if you want a different look.

## The relay

```ts
const events = relay<{
  ping: { at: string }
  select: { id: string }
}>(conn)
events.emit('select', { id: 'card-3' })
const stop = events.on('select', ({ peer, kind, data }) =>
  highlight(peer, data.id),
)
```

`emit` sends an event, and the server checks it against the kind's schema in `multiplayer({ relay })` before
publishing it to everyone but the sender. Unlike cursors and state, relay events are not volatile. `on` returns its
stop function, and the component that called it stops it on cleanup. The type parameter is yours to keep in step with
the server's schemas.

## Synced scroll and hash

Both write to a box that you share, such as a `sharedState`:

```tsx
import { sharedState } from '@kerf-js/start'
import { syncedScroll, syncedHash } from '@kerf-js/multiplayer'

// One scroll position per document, as a fraction of the scrollable
// height.
syncedScroll(scrollBox) // the window
syncedScroll(scrollBox, () => panel) // or a scrolling element
syncedHash(hashBox) // location.hash
```

`syncedScroll(box, element?)` stores the position as a fraction, rounded to four places, so screens of different
heights land on the same place. A scroll it causes itself isn't written back for 150 ms. `syncedHash(box)` keeps
`location.hash` and the box the same. Both do nothing during server rendering.

## Transports

By default cursors go over the channel's socket, through the server. A transport moves them off it:

| Package | Transport | Needs |
| ------- | --------- | ----- |
| [`@kerf-js/realtime-webrtc`](https://www.npmjs.com/package/@kerf-js/realtime-webrtc) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/realtime-webrtc)</sup> | `webrtc({ iceServers, max })`: browser to browser | STUN, and TURN across networks |
| [`@kerf-js/realtime-livekit`](https://www.npmjs.com/package/@kerf-js/realtime-livekit) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/realtime-livekit)</sup> | `livekit({ url })`, ticket `livekitTicket()` | A LiveKit server or LiveKit Cloud |
| [`@kerf-js/realtime-socketio`](https://www.npmjs.com/package/@kerf-js/realtime-socketio) <sup>[source](https://github.com/Ravonus/kerf/tree/main/packages/realtime-socketio)</sup> | `socketio({ url, path })`, ticket `socketioTicket({ secret })` | A Socket.IO server you run, with `relay(io, { secret })` |

```ts
const live = presence(chat, { transport: webrtc() })
// 'socket' until every peer is connected, then 'webrtc'
live.via.value
```

Only cursors ride a transport. State, the relay and signalling stay on the server, which checks them. A frame that
arrives off a transport is read as hostile: it must parse as a cursor (`readCursor`) and come from a connection in the
room, or it is dropped.

To write your own, implement `PeerTransport`: `{ name, open(room: PeerRoom): PeerLink }`. `room` gives you `self`,
`ticket`, `peers`, `signal(to, data)` and `onSignal(fn)` (which go through the server) and `receive(from, text)`.
Return `{ up, send, close }`; `up` is true only while a `send` reaches every peer. `transportSuite` from
`@kerf-js/multiplayer/test` checks one:

```ts
import { transportSuite } from '@kerf-js/multiplayer/test'

const checks = await transportSuite({
  make: () => myTransport(),
  ticket: (peer) => makeTicket(peer),
})
expect(checks.filter((c) => !c.ok)).toEqual([])
```

It opens two peers over a fake room and returns one `Check` (`{ name, ok, detail }`) per requirement: both links come
up, a frame reaches the other peer named by the transport, it doesn't come back to its sender, frames go both ways,
and a closed link sends nothing.

## API reference

| Entry | Export | What it is |
| ----- | ------ | ---------- |
| `@kerf-js/multiplayer` | `presence(conn, options?)` | Who else is on the connection. |
| | `cursors(presence, options?)` | Sends this pointer and tracks the others. |
| | `relay<K>(conn)` | `{ emit, on }` for typed events the server validates. |
| | `syncedScroll(box, element?)` | A scroll position in a shared box, as a fraction. |
| | `syncedHash(box)` | `location.hash` in a shared box. |
| | `locate(target, x, y, attr?, view?)` | A pointer position as a `CursorAt`, relative to the nearest anchor. |
| | `resolve(at, attr?, view?)` | A `CursorAt` back to `{ left, top }` on this screen, or `null` when the anchor isn't here. |
| | `hue(id)` | A peer's colour, 0 to 359, the same everywhere. |
| | `expire(list, now, ttl)` | The peer list without those unheard for `ttl`. |
| | `applyPeer(list, peer)` | The list with that peer added or replaced. |
| | `readCursor(text)` | A transport frame as a cursor, `null` for "left", or `undefined` when refused. |
| | types | `Peer`, `PeerUser`, `CursorAt`, `Presence`, `PresenceOptions`, `CursorOptions`, `Cursors`, `LiveCursor`, `RelayEvent`, `PeerRoom`, `PeerLink`, `PeerTransport` |
| `@kerf-js/multiplayer/server` | `multiplayer(options)` | `{ client, server, on, left }` for a `channel`. |
| | `signTicket`, `verifyTicket`, `roomId`, `cursorSchema` | See [The server half](#the-server-half). |
| | types | `MultiplayerOptions`, `TicketArgs`, `Peer`, `PeerUser`, `CursorAt` |
| `@kerf-js/multiplayer/ui` | `Cursors` | `<Cursors of={cursors(…)} />`. |
| `@kerf-js/multiplayer/test` | `transportSuite({ make, ticket? })` | The conformance checks for a `PeerTransport`. Types `Check`, `TransportSuiteOptions`. |

## Recipes

**Show who is typing.**

```tsx
const typing = state(false)
const live = presence<{ typing: boolean }>(chat, {
  state: () => ({ typing: typing.value }),
})
const names = derived(() =>
  live.peers.value
    .filter((p) => p.state?.typing)
    .map((p) => p.user.name),
)
```

**Follow the presenter's scroll.**

```ts
// src/server/deck.ts
export const deckScroll = sharedState('deck-scroll', {
  key: z.string().max(64),
  value: z.number().min(0).max(1),
  initial: 0,
  authorize: { read: isParticipant, write: isPresenter },
})
```

```tsx
syncedScroll(deckScroll.connect(() => props.id))
```

**Cursors only inside one panel.**

```tsx
const pointers = cursors(live, {
  root: () => board,
  anchor: 'data-anchor',
})
```

## Limits

| What | Limit | Where it is enforced |
| ---- | ----- | -------------------- |
| One peer's `state` | 4096 bytes of JSON (option `state`) | Server schema |
| Relay `data` | 2048 bytes of JSON, a declared kind only | Server schema, then the kind's schema |
| A signal (transport offers and candidates) | 16384 bytes | Server schema |
| A cursor | `x`, `y` in `[-0.5, 1.5]`; anchor id up to 128 characters; style up to 16 | Server schema and `readCursor` |
| Cursor sends | 12 a second by default | Client |
| Peer expiry | three missed heartbeats (45 s by default) | Client |

The channel's own limits apply on top: 20 messages a second per socket by default (R008), raised with `limits`. A
reconnect replays at most what the channel keeps, and presence rebuilds itself on a reset, so nothing here is stored.

## Troubleshooting

| Symptom | Cause | Fix |
| ------- | ----- | --- |
| A server error ``\`user\` must return an object with an `id` `` | `user` returned nothing or a non-string `id`. | Return `{ id, name? }`, for example from `ctx.user`. |
| `emit` rejects with Q002 `` `kind` refused its data `` | The data failed that kind's schema. | Send what the schema accepts. |
| `emit` rejects with a schema issue "that relay kind is not declared" | The kind isn't in `multiplayer({ relay })`, or its data is over 2048 bytes. | Declare it on the server. |
| R008 on the channel | Over the channel's rate limit. | Lower `rate` in `cursors()`, or raise `limits.perSecond` on the channel. |
| A cursor never shows | Its anchor id isn't on this page, or the attribute differs between clients. | Use the same `anchor` attribute and ids everywhere. |
| `via` stays `'socket'` | The transport isn't up for every peer yet. Cursors still flow through the server. | See the transport's README. |

## End-to-end tests

From the repository, `pnpm --filter @kerf-js/multiplayer test:e2e prepare <dir>` prepares a room;
`pnpm --filter @kerf-js/multiplayer test:e2e run <dir>` runs it in two browsers. The entrypoint
stays `.mjs` because Node runs it directly, outside Vitest.

`run` takes `--runtimes node,bun,deno`, `--bus memory,redis,nats` (each browser talks to its own instance, so
everything crosses the bus) and `--via webrtc|socketio|livekit` for a transport. `--redis <bin>` and `--nats <bin>` run
a throwaway server; `REDIS_URL` and `NATS_URL` use yours. `--via livekit` needs `LIVEKIT_URL`, `LIVEKIT_API_KEY` and
`LIVEKIT_API_SECRET`.

## Related packages

| Package | What it is |
| ------- | ---------- |
| [`@kerf-js/start`](https://www.npmjs.com/package/@kerf-js/start) | `channel`, `sharedState` and `realtime()`, which this builds on. |
| [`@kerf-js/realtime-webrtc`](https://www.npmjs.com/package/@kerf-js/realtime-webrtc) | Cursors browser to browser over WebRTC data channels. |
| [`@kerf-js/realtime-livekit`](https://www.npmjs.com/package/@kerf-js/realtime-livekit) | Cursors over a LiveKit room, which also carries audio and video. |
| [`@kerf-js/realtime-socketio`](https://www.npmjs.com/package/@kerf-js/realtime-socketio) | Cursors through a Socket.IO relay you run. |
| [`@kerf-js/realtime-redis`](https://www.npmjs.com/package/@kerf-js/realtime-redis) | A `realtime.bus` over Redis, so a room spans several server instances. |
| [`@kerf-js/realtime-nats`](https://www.npmjs.com/package/@kerf-js/realtime-nats) | A `realtime.bus` over NATS. |
| [`@kerf-js/realtime-durable-object`](https://www.npmjs.com/package/@kerf-js/realtime-durable-object) | A `realtime.bus` on Cloudflare Durable Objects. |
| [`@kerf-js/core`](https://www.npmjs.com/package/@kerf-js/core) | The compiler and reactive runtime, the Vite plugin, the plugin system and test utilities. |

## Contributing

See [CONTRIBUTING.md](https://github.com/Ravonus/kerf/blob/main/CONTRIBUTING.md). From the repository,
`pnpm --filter @kerf-js/multiplayer test` runs the unit tests: the server fragment on its own, and the client against
`@kerf-js/core/test`'s fake socket with the real channel client and server.

## License

[MIT](https://github.com/Ravonus/kerf/blob/main/LICENSE)
